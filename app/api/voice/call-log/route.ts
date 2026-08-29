import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { normalisePhone } from '@/lib/voice-auth';

/**
 * POST /api/voice/call-log
 *
 * ElevenLabs post-call webhook. Fires at the end of every conversation.
 * Verifies HMAC signature using ELEVENLABS_WEBHOOK_SECRET, then extracts
 * structured data from ElevenLabs payload + data_collection_results and
 * persists to public.voice_calls.
 *
 * Reference: https://elevenlabs.io/docs/conversational-ai/customization/personalization/post-call-webhooks
 */
export const runtime = 'nodejs';

const WEBHOOK_TOLERANCE_SEC = 30 * 60; // 30 minutes

function verifyHmacSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  // ElevenLabs sends: "t=1234567890,v0=abc123..."
  const parts = signatureHeader.split(',');
  const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2);
  const receivedSig = parts.find((p) => p.startsWith('v0='))?.slice(3);
  if (!timestamp || !receivedSig) return false;

  // Reject stale timestamps
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > WEBHOOK_TOLERANCE_SEC) return false;

  const payload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(receivedSig));
  } catch {
    return false;
  }
}

// Also accept legacy Bearer auth (from our own tools' call-log calls)
function verifyBearer(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const expected = process.env.VOICE_AGENT_TOKEN;
  if (!auth || !expected) return false;
  return auth === `Bearer ${expected}`;
}

type DataCollection = Record<string, { value?: unknown } | unknown>;

function pickFromDataCollection(dc: DataCollection | undefined, key: string): unknown {
  if (!dc) return undefined;
  const entry = dc[key] as any;
  if (entry === undefined || entry === null) return undefined;
  if (typeof entry === 'object' && 'value' in entry) return entry.value;
  return entry;
}

function normaliseHmo(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.toLowerCase().trim();
  if (['maccabi', 'clalit', 'leumit', 'meuhedet', 'private', 'unknown'].includes(s)) return s;
  if (s.includes('מכבי')) return 'maccabi';
  if (s.includes('כללית')) return 'clalit';
  if (s.includes('לאומית')) return 'leumit';
  if (s.includes('מאוחדת')) return 'meuhedet';
  return 'unknown';
}

function normaliseOutcome(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.toLowerCase().trim();
  if (['booked', 'intake_sent', 'escalated', 'info_only', 'dropped', 'error'].includes(s)) return s;
  return undefined;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Auth: HMAC (ElevenLabs webhook) OR Bearer (legacy tool call)
  const signature = req.headers.get('elevenlabs-signature') || req.headers.get('x-elevenlabs-signature');
  const isValidHmac = signature ? verifyHmacSignature(rawBody, signature) : false;
  const isValidBearer = verifyBearer(req);

  if (!isValidHmac && !isValidBearer) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  // ElevenLabs sends: { type: "post_call_transcription", event_timestamp, data: { conversation_id, agent_id, transcript, metadata, analysis } }
  const data = payload.data || payload; // support both wrappers
  const conv = data.conversation || data;
  const meta = conv.metadata || data.metadata || {};
  const analysis = conv.analysis || data.analysis || {};
  const dataCollection: DataCollection = analysis.data_collection_results || {};
  const transcript = conv.transcript || data.transcript || [];

  // Extract caller phone from Twilio metadata
  const callerPhoneRaw =
    meta.phone_call?.external_number ||
    meta.phone_call?.caller_id ||
    meta.caller_id ||
    (pickFromDataCollection(dataCollection, 'caller_phone') as string) ||
    'unknown';

  const callerPhone = normalisePhone(callerPhoneRaw) || callerPhoneRaw;

  // Extract structured fields
  const callerName = pickFromDataCollection(dataCollection, 'caller_name') as string | undefined;
  const childName = pickFromDataCollection(dataCollection, 'child_name') as string | undefined;
  const childAgeRaw = pickFromDataCollection(dataCollection, 'child_age');
  const childAge = typeof childAgeRaw === 'number' ? childAgeRaw : childAgeRaw ? Number(childAgeRaw) : undefined;
  const hmo = normaliseHmo(pickFromDataCollection(dataCollection, 'hmo'));
  const purpose = pickFromDataCollection(dataCollection, 'purpose') as string | undefined;
  const outcome = normaliseOutcome(pickFromDataCollection(dataCollection, 'outcome'));
  const nextAction = pickFromDataCollection(dataCollection, 'next_action') as string | undefined;
  const language = (conv.main_language || data.main_language || 'ar') as string;
  const languageUsed = ['he', 'ar', 'mixed'].includes(language) ? language : 'ar';

  const startTs = meta.start_time_unix_secs || conv.start_time_unix_secs;
  const durationSec = meta.call_duration_secs || conv.call_duration_secs;
  const callStartedAt = startTs ? new Date(startTs * 1000).toISOString() : undefined;
  const callEndedAt =
    startTs && durationSec ? new Date((startTs + durationSec) * 1000).toISOString() : undefined;

  const conversationId = conv.conversation_id || data.conversation_id;
  const transcriptUrl = conversationId
    ? `https://elevenlabs.io/app/conversational-ai/history/${conversationId}`
    : undefined;

  // Extract tool calls from transcript
  const toolCalls: Array<Record<string, unknown>> = [];
  if (Array.isArray(transcript)) {
    for (const turn of transcript) {
      if (turn?.tool_calls && Array.isArray(turn.tool_calls)) {
        for (const tc of turn.tool_calls) {
          toolCalls.push({ tool_name: tc.tool_name || tc.name, params: tc.params, result: tc.result });
        }
      }
    }
  }

  const supabase = getSupabaseAdmin();
  const { data: inserted, error } = await supabase
    .from('voice_calls')
    .insert({
      call_started_at: callStartedAt,
      call_ended_at: callEndedAt,
      duration_seconds: durationSec,
      caller_phone: callerPhone,
      caller_name: callerName,
      child_name: childName,
      child_age: childAge && !isNaN(childAge) ? childAge : undefined,
      hmo,
      language_used: languageUsed,
      purpose,
      outcome: outcome || (durationSec && durationSec < 10 ? 'dropped' : 'info_only'),
      next_action: nextAction,
      transcript_url: transcriptUrl,
      raw_summary: {
        conversation_id: conversationId,
        transcript,
        summary: analysis.transcript_summary || conv.transcript_summary,
        title: analysis.call_summary_title || conv.call_summary_title,
        call_successful: analysis.call_successful || conv.call_successful,
      },
      agent_tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[voice/call-log] insert failed', error);
    return NextResponse.json(
      { success: false, error: 'db_insert_failed', details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, id: inserted?.id });
}
