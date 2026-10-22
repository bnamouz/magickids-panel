import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertNourAuth, normalisePhone } from '@/lib/nour-auth';
import { sendClinicPreferred } from '@/lib/whatsapp-clinic';

/**
 * POST /api/nour/escalate
 * Sends an urgent WhatsApp alert to Dr. Baseem RIGHT NOW.
 * Only used by Nour for genuine emergencies.
 */
export const runtime = 'nodejs';

const Schema = z.object({
  reason: z.string().min(3),
  caller_name: z.string().min(1),
  caller_phone: z.string().min(6),
});

// Nour belongs to the pediatric clinic: sent from the clinic number (054-349-6656), falling back to Dr. Namouz's number.
async function sendUrgentWhatsApp(text: string) {
  const to = process.env.ESCALATION_WHATSAPP?.replace(/\\n/g, '').trim() || '+972509955137';
  const result = await sendClinicPreferred({ toPhone: to, body: text });
  if (!result.ok) throw new Error(result.error || 'whatsapp_send_failed');
  return result;
}

export async function POST(req: NextRequest) {
  const unauth = assertNourAuth(req);
  if (unauth) return unauth;

  let body: z.infer<typeof Schema>;
  try {
    body = Schema.parse(await req.json());
  } catch (e: any) {
    return NextResponse.json({ error: 'invalid_body', details: e?.errors }, { status: 400 });
  }

  const callerPhone = normalisePhone(body.caller_phone) || body.caller_phone;

  const alertText = [
    '🚨 *התראה דחופה מנור*',
    '',
    `*מתקשר:* ${body.caller_name}`,
    `*טלפון:* ${callerPhone}`,
    `*סיבה:* ${body.reason}`,
    '',
    '_נור סימנה את השיחה הזאת כדחופה - התקשר בהקדם._',
  ].join('\n');

  try {
    await sendUrgentWhatsApp(alertText);
    return NextResponse.json({ success: true, message: 'urgent_alert_sent' });
  } catch (e: any) {
    return NextResponse.json({ error: 'send_failed', details: e?.message }, { status: 500 });
  }
}
