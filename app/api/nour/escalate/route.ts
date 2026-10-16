import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertNourAuth, normalisePhone } from '@/lib/nour-auth';
import { sendInstituteWhatsAppText } from '@/lib/whatsapp-ultramsg';

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

// Sent from the verified institute WhatsApp; the shared Nour/Marhaba instance is not used.
async function sendUrgentWhatsApp(text: string) {
  const to = process.env.ESCALATION_WHATSAPP?.replace(/\\n/g, '').trim() || '+972544020043';
  const result = await sendInstituteWhatsAppText({ toPhone: to, body: text });
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
