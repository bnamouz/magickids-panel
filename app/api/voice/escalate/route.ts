import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertVoiceAuth, normalisePhone } from '@/lib/voice-auth';
import { sendWhatsAppText } from '@/lib/whatsapp-ultramsg';

/**
 * POST /api/voice/escalate
 *
 * Fires an urgent WhatsApp alert to Dr. Baseem when the voice agent detects
 * an emergency, a VIP caller, or a scenario it can't safely handle.
 */
export const runtime = 'nodejs';

const BodySchema = z.object({
  caller_phone: z.string().min(6),
  caller_name: z.string().optional(),
  child_name: z.string().optional(),
  reason: z.enum(['emergency', 'vip', 'complex', 'request_human', 'other']),
  summary: z.string().min(1),
  language: z.enum(['he', 'ar']).default('he'),
});

const REASON_LABEL_HE: Record<string, string> = {
  emergency: '🚨 חירום',
  vip: '⭐ VIP',
  complex: '❓ מקרה מורכב',
  request_human: '👤 ההורה ביקש/ה לדבר עם ד"ר בסים',
  other: 'ℹ️ אחר',
};

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

  const callerPhone = normalisePhone(body.caller_phone);
  const target =
    normalisePhone(process.env.ESCALATION_WHATSAPP || '+972544020043') ||
    '+972544020043';

  const now = new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'numeric',
    hour12: false,
  }).format(new Date());

  const alert = [
    `${REASON_LABEL_HE[body.reason]} — פנייה קולית דורשת התערבות`,
    `זמן: ${now}`,
    body.caller_name ? `שם הפונה: ${body.caller_name}` : null,
    callerPhone ? `טלפון: ${callerPhone}` : null,
    body.child_name ? `שם הילד/ה: ${body.child_name}` : null,
    `שפה: ${body.language === 'ar' ? 'ערבית' : 'עברית'}`,
    ``,
    `סיכום השיחה:`,
    body.summary,
  ]
    .filter(Boolean)
    .join('\n');

  const waResult = await sendWhatsAppText({
    toPhone: target,
    body: alert,
    priority: 10,
  });

  if (!waResult.ok) {
    return NextResponse.json(
      {
        success: false,
        error: 'whatsapp_send_failed',
        details: waResult.error,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, notified: target });
}
