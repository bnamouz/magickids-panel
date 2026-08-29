import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertNourAuth } from '@/lib/nour-auth';

/**
 * POST /api/nour/send-summary
 *
 * Sends a WhatsApp summary of the call to the user (Dr. Baseem) via UltraMsg.
 * Called by Nour at end of every call (or via post-call webhook).
 *
 * Body: { caller_name, caller_phone, summary, urgency, meeting_scheduled }
 */
export const runtime = 'nodejs';

const BodySchema = z.object({
  caller_name: z.string(),
  caller_phone: z.string().optional(),
  summary: z.string().min(1),
  urgency: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
  meeting_scheduled: z
    .object({
      title: z.string(),
      datetime_iso: z.string(),
    })
    .optional(),
  callback_requested: z.boolean().optional(),
});

const URGENCY_ICONS = {
  low: '💬',
  normal: '📞',
  high: '⚠️',
  urgent: '🚨',
};

const URGENCY_LABELS = {
  low: 'רגיל',
  normal: 'רגיל',
  high: 'חשוב',
  urgent: 'דחוף',
};

export async function POST(req: NextRequest) {
  const unauth = assertNourAuth(req);
  if (unauth) return unauth;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e: any) {
    return NextResponse.json({ success: false, error: 'invalid_body', details: e?.errors }, { status: 400 });
  }

  const instanceId = process.env.ULTRAMSG_INSTANCE_ID;
  const token = process.env.ULTRAMSG_TOKEN;
  const drBaseemPhone = process.env.ESCALATION_WHATSAPP;

  if (!instanceId || !token || !drBaseemPhone) {
    return NextResponse.json({
      success: false,
      error: 'whatsapp_not_configured',
    });
  }

  // Build message
  const icon = URGENCY_ICONS[body.urgency];
  const urgencyLabel = URGENCY_LABELS[body.urgency];

  let msg = `${icon} *שיחה חדשה - נور*\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n`;
  msg += `👤 *${body.caller_name}*\n`;
  if (body.caller_phone) msg += `☎️ ${body.caller_phone}\n`;
  msg += `🎯 סיווג: ${urgencyLabel}\n\n`;
  msg += `📝 *סיכום:*\n${body.summary}\n`;

  if (body.meeting_scheduled) {
    const dt = new Date(body.meeting_scheduled.datetime_iso);
    const dtStr = dt.toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jerusalem',
    });
    msg += `\n📅 *פגישה נקבעה:*\n${body.meeting_scheduled.title}\n${dtStr}\n`;
  }

  if (body.callback_requested) {
    msg += `\n📲 *ביקש/ה שתתקשר בחזרה*\n`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━`;

  try {
    const ultraUrl = `https://api.ultramsg.com/${instanceId}/messages/chat`;
    const params = new URLSearchParams({
      token,
      to: drBaseemPhone,
      body: msg,
    });

    const response = await fetch(ultraUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await response.json();

    if (!data.sent) {
      return NextResponse.json({
        success: false,
        error: 'whatsapp_send_failed',
        details: data,
      });
    }

    return NextResponse.json({
      success: true,
      whatsapp_message_id: String(data.id || ''),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'whatsapp_error', details: err.message });
  }
}
