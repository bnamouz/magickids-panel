// app/api/marhaba/post-call/route.ts
// ElevenLabs webhook — sync sales call outcome to marhaba_leads.
// Filters by dynamic_variables.marhaba_sales_mode === 'true' — non-sales calls ignored.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verifyHmac(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  // ElevenLabs format: "t=TIMESTAMP,v0=HASH" — extract v0
  let hashToCompare = signature;
  const v0Match = signature.match(/v0=([a-f0-9]+)/i);
  if (v0Match) hashToCompare = v0Match[1];

  // Also try timestamp-prefixed HMAC (t=TS,v0=HMAC(TS.body))
  const tMatch = signature.match(/t=(\d+)/);
  const timestamp = tMatch ? tMatch[1] : '';

  const attempts: string[] = [
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex'),
  ];
  if (timestamp) {
    attempts.push(crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex'));
  }

  return attempts.some(exp => {
    try {
      return crypto.timingSafeEqual(Buffer.from(exp, 'hex'), Buffer.from(hashToCompare, 'hex'));
    } catch {
      return false;
    }
  });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature =
    req.headers.get('elevenlabs-signature') ||
    req.headers.get('x-elevenlabs-signature') ||
    '';
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET || '';

  if (secret && !verifyHmac(rawBody, signature, secret)) {
    console.warn('[marhaba/post-call] hmac verify failed');
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const data = payload?.data || payload;
  const dynVars = data?.conversation_initiation_client_data?.dynamic_variables || {};
  const isMarhabaSales = String(dynVars?.marhaba_sales_mode || '').toLowerCase() === 'true';

  // Ignore non-Marhaba-sales calls (e.g. Nour personal secretary calls)
  if (!isMarhabaSales) {
    return NextResponse.json({ skipped: 'not_marhaba_sales' });
  }

  const leadIdRaw = dynVars?.lead_id;
  const leadId = leadIdRaw ? parseInt(String(leadIdRaw), 10) : null;
  const conversationId = data?.conversation_id;
  const transcript = data?.transcript || [];
  const analysis = data?.analysis || {};
  const collectionResults = analysis?.data_collection_results || {};
  const metadata = data?.metadata || {};
  const phoneCall = metadata?.phone_call || {};

  const outcome =
    collectionResults?.call_outcome?.value ||
    collectionResults?.outcome?.value ||
    'unknown';
  const interestLevel =
    collectionResults?.interest_level?.value ||
    collectionResults?.lead_temperature?.value ||
    null;
  const objections =
    collectionResults?.objections?.value ||
    collectionResults?.objection?.value ||
    null;
  const painPoints =
    collectionResults?.pain_points?.value ||
    collectionResults?.pain_point?.value ||
    null;

  const supabase = getSupabaseAdmin();

  // Persist the call itself (transcript + metadata) to marhaba_calls
  if (leadId && Number.isFinite(leadId) && conversationId) {
    const cleanTranscript = Array.isArray(transcript)
      ? transcript
          .filter((t: any) => t?.message)
          .map((t: any) => ({
            role: t.role,
            message: t.message,
            time_in_call_secs: t.time_in_call_secs,
          }))
      : [];

    const startedUnix = metadata?.start_time_unix_secs;
    const durationSecs = metadata?.call_duration_secs;
    const startedAt = startedUnix ? new Date(startedUnix * 1000).toISOString() : null;
    const endedAt = startedUnix && durationSecs
      ? new Date((startedUnix + durationSecs) * 1000).toISOString()
      : null;

    await supabase.from('marhaba_calls').upsert({
      lead_id: leadId,
      conversation_id: conversationId,
      call_sid: phoneCall?.call_sid || null,
      agent_id: data?.agent_id || null,
      phone_number_id: phoneCall?.agent_phone_number_id || null,
      direction: 'outbound',
      started_at: startedAt,
      ended_at: endedAt,
      duration_secs: durationSecs || null,
      status: data?.status || null,
      termination_reason: metadata?.termination_reason || null,
      call_successful: analysis?.call_successful || null,
      transcript: cleanTranscript,
      transcript_summary: analysis?.transcript_summary || null,
      first_message: data?.conversation_initiation_client_data?.conversation_config_override?.agent?.first_message || null,
      raw_payload: data,
    }, { onConflict: 'conversation_id' });
  }

  if (leadId && Number.isFinite(leadId)) {
    // Fetch existing call_history
    const { data: existing } = await supabase
      .from('marhaba_leads')
      .select('call_history')
      .eq('id', leadId)
      .maybeSingle();

    const history = Array.isArray(existing?.call_history) ? existing!.call_history : [];
    history.push({
      conversation_id: conversationId,
      outcome,
      interest_level: interestLevel,
      objections,
      pain_points: painPoints,
      transcript_length: transcript.length,
      timestamp: new Date().toISOString(),
    });

    // Determine next status if still calling
    const updates: any = {
      call_history: history,
      last_call_at: new Date().toISOString(),
    };
    if (interestLevel) updates.interest_level = interestLevel;

    // If outcome suggests next state, set it
    if (outcome === 'demo_booked') updates.status = 'demo_booked';
    else if (outcome === 'video_sent') updates.status = 'video_sent';
    else if (outcome === 'not_interested') updates.status = 'not_interested';
    else if (outcome === 'callback_requested') updates.status = 'callback_requested';
    else if (outcome === 'no_answer' || outcome === 'voicemail') {
      updates.status = 'queued';
      updates.next_action_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }

    await supabase.from('marhaba_leads').update(updates).eq('id', leadId);
  }

  return NextResponse.json({
    ok: true,
    lead_id: leadId,
    conversation_id: conversationId,
    outcome,
  });
}
