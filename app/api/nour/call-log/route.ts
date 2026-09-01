import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { normalisePhone } from '@/lib/nour-auth';

/**
 * POST /api/nour/call-log
 *
 * ElevenLabs post-call webhook for Nour. Verifies HMAC signature, then
 * persists structured data to public.nour_calls. Also automatically sends
 * a WhatsApp summary to Dr. Baseem after each call.
 */
export const runtime = 'nodejs';

const WEBHOOK_TOLERANCE_SEC = 30 * 60;

function verifyHmacSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.NOUR_ELEVENLABS_WEBHOOK_SECRET || process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const parts = signatureHeader.split(',');
  const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2);
  const receivedSig = parts.find((p) => p.startsWith('v0='))?.slice(3);
  if (!timestamp || !receivedSig) return false;

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

function pickDC(dc: any, key: string): unknown {
  if (!dc) return undefined;
  const e = dc[key];
  if (e === undefined || e === null) return undefined;
  if (typeof e === 'object' && 'value' in e) return e.value;
  return e;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('elevenlabs-signature') || req.headers.get('x-elevenlabs-signature');

  const validHmac = signature ? verifyHmacSignature(rawBody, signature) : false;
  const authHeader = req.headers.get('authorization');
  const validBearer = authHeader === `Bearer ${process.env.VOICE_AGENT_TOKEN}`;

  if (!validHmac && !validBearer) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  const data = payload.data || payload;
  const conv = data.conversation || data;
  const meta = conv.metadata || data.metadata || {};
  const analysis = conv.analysis || data.analysis || {};
  const dc = analysis.data_collection_results || {};
  const transcript = conv.transcript || data.transcript || [];

  // Skip Marhaba sales calls — they are handled by /api/marhaba/post-call.
  // Prevents sales calls from polluting nour_calls and triggering personal-secretary WhatsApp summary.
  const dynVars =
    conv?.conversation_initiation_client_data?.dynamic_variables ||
    data?.conversation_initiation_client_data?.dynamic_variables ||
    {};
  if (String(dynVars?.marhaba_sales_mode || '').toLowerCase() === 'true') {
    return NextResponse.json({ success: true, skipped: 'marhaba_sales_call' });
  }

  const callerPhoneRaw =
    meta.phone_call?.external_number ||
    meta.phone_call?.caller_id ||
    (pickDC(dc, 'caller_phone') as string) ||
    'unknown';
  const callerPhone = normalisePhone(callerPhoneRaw) || callerPhoneRaw;

  const callerName = pickDC(dc, 'caller_name') as string | undefined;
  const purpose = pickDC(dc, 'purpose') as string | undefined;
  const urgency = pickDC(dc, 'urgency') as string | undefined;
  const outcome = pickDC(dc, 'outcome') as string | undefined;
  const meetingDT = pickDC(dc, 'meeting_datetime') as string | undefined;
  const meetingTopic = pickDC(dc, 'meeting_topic') as string | undefined;
  const callbackRequested = pickDC(dc, 'callback_requested') as boolean | undefined;
  const language = conv.main_language || 'ar';

  const startTs = meta.start_time_unix_secs || conv.start_time_unix_secs;
  const durationSec = meta.call_duration_secs || conv.call_duration_secs;
  const callStartedAt = startTs ? new Date(startTs * 1000).toISOString() : undefined;
  const callEndedAt =
    startTs && durationSec ? new Date((startTs + durationSec) * 1000).toISOString() : undefined;

  const conversationId = conv.conversation_id || data.conversation_id;
  const transcriptUrl = conversationId
    ? `https://elevenlabs.io/app/conversational-ai/history/${conversationId}`
    : undefined;

  // Extract tool calls
  const toolCalls: any[] = [];
  if (Array.isArray(transcript)) {
    for (const turn of transcript) {
      if (turn?.tool_calls && Array.isArray(turn.tool_calls)) {
        for (const tc of turn.tool_calls) {
          toolCalls.push({
            tool_name: tc.tool_name || tc.name,
            params: tc.params || tc.params_as_json,
            result: tc.result || tc.result_value,
          });
        }
      }
    }
  }

  // Determine caller type
  const supabase = getSupabaseAdmin();
  const { data: vipRow } = await supabase
    .from('nour_vip_list')
    .select('name')
    .eq('phone_e164', callerPhone)
    .maybeSingle();
  const { data: contactRow } = await supabase
    .from('nour_contacts_cache')
    .select('display_name')
    .eq('phone_e164', callerPhone)
    .maybeSingle();

  const callerType = vipRow
    ? 'vip_rejected'
    : contactRow
      ? 'known_contact'
      : durationSec && durationSec < 5
        ? 'spam'
        : 'unknown';

  const { data: inserted, error } = await supabase
    .from('nour_calls')
    .insert({
      call_started_at: callStartedAt,
      call_ended_at: callEndedAt,
      duration_seconds: durationSec,
      caller_phone: callerPhone,
      caller_name: callerName || vipRow?.name || contactRow?.display_name,
      caller_type: callerType,
      purpose,
      urgency: (urgency && ['low', 'normal', 'high', 'urgent'].includes(urgency)) ? urgency : 'normal',
      outcome:
        (outcome && ['info_only', 'meeting_booked', 'callback_requested', 'task_created', 'escalated', 'dropped'].includes(outcome))
          ? outcome
          : durationSec && durationSec < 10
            ? 'dropped'
            : 'info_only',
      meeting_datetime: meetingDT,
      meeting_topic: meetingTopic,
      callback_requested: !!callbackRequested,
      language_used: ['he', 'ar', 'en', 'mixed'].includes(language) ? language : 'ar',
      transcript_url: transcriptUrl,
      raw_summary: {
        conversation_id: conversationId,
        transcript,
        title: analysis.call_summary_title,
        summary: analysis.transcript_summary,
      },
      agent_tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[nour/call-log] db insert failed', error);
    return NextResponse.json({ success: false, error: 'db_insert_failed', details: error.message }, { status: 500 });
  }

  // Auto-send WhatsApp summary if not spam and not VIP-rejected
  if (callerType !== 'spam' && callerType !== 'vip_rejected' && analysis.transcript_summary) {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_BASE_URL}/api/nour/send-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.VOICE_AGENT_TOKEN}`,
        },
        body: JSON.stringify({
          caller_name: callerName || 'לא ידוע',
          caller_phone: callerPhone,
          summary: analysis.transcript_summary || purpose || 'שיחה ללא סיכום',
          urgency: (urgency && ['low', 'normal', 'high', 'urgent'].includes(urgency)) ? urgency : 'normal',
          meeting_scheduled: meetingDT && meetingTopic ? { title: meetingTopic, datetime_iso: meetingDT } : undefined,
          callback_requested: !!callbackRequested,
        }),
      });
    } catch (e) {
      console.error('[nour/call-log] whatsapp summary failed', e);
    }
  }

  return NextResponse.json({ success: true, id: inserted?.id });
}
