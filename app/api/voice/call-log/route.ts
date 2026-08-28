import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { assertVoiceAuth, normalisePhone } from '@/lib/voice-auth';

/**
 * POST /api/voice/call-log
 *
 * Called by ElevenLabs at the end of every call (post-call webhook / data
 * collection) to persist a structured summary of what happened. Writes to
 * public.voice_calls (see db/migrations/20260828_voice_calls.sql).
 */
export const runtime = 'nodejs';

const BodySchema = z.object({
  call_started_at: z.string().optional(),
  call_ended_at: z.string().optional(),
  duration_seconds: z.number().int().min(0).optional(),
  caller_phone: z.string().min(6),
  caller_name: z.string().optional(),
  child_name: z.string().optional(),
  child_age: z.number().int().optional(),
  hmo: z.enum(['maccabi', 'clalit', 'leumit', 'meuhedet', 'private', 'unknown']).optional(),
  language_used: z.enum(['he', 'ar', 'mixed']).optional(),
  purpose: z.string().optional(),
  outcome: z.enum(['booked', 'intake_sent', 'escalated', 'info_only', 'dropped', 'error']).optional(),
  next_action: z.string().optional(),
  linked_case_id: z.string().uuid().optional(),
  linked_appointment_id: z.string().uuid().optional(),
  transcript_url: z.string().url().optional(),
  raw_summary: z.record(z.string(), z.any()).optional(),
  agent_tool_calls: z.array(z.record(z.string(), z.any())).optional(),
});

export async function POST(req: NextRequest) {
  const unauth = assertVoiceAuth(req);
  if (unauth) return unauth;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: 'invalid_body', details: e?.errors || String(e) },
      { status: 400 },
    );
  }

  const phone = normalisePhone(body.caller_phone) || body.caller_phone;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('voice_calls')
    .insert({
      call_started_at: body.call_started_at,
      call_ended_at: body.call_ended_at,
      duration_seconds: body.duration_seconds,
      caller_phone: phone,
      caller_name: body.caller_name,
      child_name: body.child_name,
      child_age: body.child_age,
      hmo: body.hmo,
      language_used: body.language_used,
      purpose: body.purpose,
      outcome: body.outcome,
      next_action: body.next_action,
      linked_case_id: body.linked_case_id,
      linked_appointment_id: body.linked_appointment_id,
      transcript_url: body.transcript_url,
      raw_summary: body.raw_summary,
      agent_tool_calls: body.agent_tool_calls,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { success: false, error: 'db_insert_failed', details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, id: data?.id });
}
