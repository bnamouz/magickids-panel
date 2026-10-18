import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertVoiceAuth, normalisePhone } from '@/lib/voice-auth';
import { sendIntakeLink } from '@/lib/voice/intake-link';

/**
 * POST /api/voice/send-intake-link
 *
 * Sends the family a WhatsApp with the public registration link so they can
 * fill the parent + teacher Vanderbilt questionnaires. Called by the agent
 * when either the family has no intake session yet, or the questionnaires
 * are still incomplete.
 */
export const runtime = 'nodejs';

const BodySchema = z.object({
  // Number the caller dictated. Optional: when missing or malformed we fall
  // back to the caller ID that ElevenLabs passes in `caller_id`.
  phone: z.string().optional(),
  caller_id: z.string().optional(),
  parent_name: z.string().optional(),
  child_name: z.string().optional(),
  language: z.enum(['he', 'ar']).default('he'),
  reason: z.enum(['new_family', 'incomplete_intake', 'maccabi_gate']).optional(),
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

  // Voice transcription and the model's own E.164 conversion sometimes add or
  // drop a digit (e.g. 0548800600 -> +9725448800600). Prefer the dictated
  // number when it is valid; otherwise use the verified caller ID, so the
  // family still gets the link. Never guess beyond these two sources.
  const dictated = normalisePhone(body.phone);
  const callerId = normalisePhone(body.caller_id);
  const phone = dictated || callerId;
  const usedCallerId = !dictated && !!callerId;
  if (!phone) {
    return NextResponse.json(
      {
        success: false,
        error: 'invalid_phone',
        instruction:
          'The number is not a valid Israeli mobile number (05X followed by 7 digits). Read the number back digit by digit and ask the caller to repeat it. If it still fails, use escalate_to_human.',
      },
      { status: 400 },
    );
  }

  const sent = await sendIntakeLink({ phone, language: body.language, parentName: body.parent_name, childName: body.child_name, reason: body.reason ?? null, source: 'voice' });
  if (!sent.ok) {
    return NextResponse.json({ success: false, error: 'whatsapp_send_failed', details: sent.error }, { status: 502 });
  }
  const link = sent.link;
  const waResult = { id: sent.id };

  return NextResponse.json({
    success: true,
    link,
    whatsapp_message_id: waResult.id,
    sent_to: phone,
    used_caller_id: usedCallerId,
    // Local format so the agent can read it back to the caller.
    sent_to_local: '0' + phone.slice(4),
  });
}
