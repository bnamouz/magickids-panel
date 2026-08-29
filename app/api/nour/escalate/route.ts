import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireVoiceAuth, normalisePhone } from '@/lib/nour-auth';

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

async function sendUrgentWhatsApp(text: string) {
  const instance = process.env.ULTRAMSG_INSTANCE_ID;
  const token = process.env.ULTRAMSG_TOKEN;
  const to = process.env.ESCALATION_WHATSAPP || '+972544020043';
  if (!instance || !token) throw new Error('ultramsg_not_configured');

  const url = `https://api.ultramsg.com/${instance}/messages/chat`;
  const body = new URLSearchParams({
    token,
    to,
    body: text,
    priority: '1',
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`ultramsg_${res.status}`);
  return res.json();
}

export async function POST(req: NextRequest) {
  const auth = requireVoiceAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

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
