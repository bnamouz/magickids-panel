import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertVoiceAuth, normalisePhone } from '@/lib/voice-auth';
import { sendInstituteWhatsAppText } from '@/lib/whatsapp-ultramsg';
import { VOICE_LINKS, VOICE_LINK_KEYS, voiceLinkUrl } from '@/lib/voice/links';

/**
 * POST /api/voice/send-link
 * Sends one or more fixed institute links by WhatsApp from the institute number.
 * Same phone rules as send-intake-link: dictated number if valid, else caller ID.
 */
export const runtime = 'nodejs';

const BodySchema = z.object({
  links: z.array(z.enum(VOICE_LINK_KEYS)).min(1).max(3),
  phone: z.string().optional(),
  caller_id: z.string().optional(),
  parent_name: z.string().max(60).optional(),
  language: z.enum(['he', 'ar']).default('he'),
});

export async function POST(req: NextRequest) {
  const unauth = assertVoiceAuth(req);
  if (unauth) return unauth;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'invalid_body', allowed_links: VOICE_LINK_KEYS }, { status: 400 });
  }
  const body = parsed.data;
  const dictated = normalisePhone(body.phone);
  const callerId = normalisePhone(body.caller_id);
  const phone = dictated || callerId;
  if (!phone) {
    return NextResponse.json({
      success: false, error: 'invalid_phone',
      instruction: 'Read the number back digit by digit and ask the caller to repeat it. If it still fails, use escalate_to_human.',
    }, { status: 400 });
  }

  const keys = Array.from(new Set(body.links));
  const lang = body.language;
  const name = body.parent_name ? ` ${body.parent_name}` : '';
  const lines = keys.flatMap((k) => [`${VOICE_LINKS[k][lang]}:`, voiceLinkUrl(k, lang), '']);
  const message = lang === 'ar'
    ? [`مرحبًا${name}، هاي سارة من معهد أطفال السحر. متل ما حكينا، هاي الروابط:`, '', ...lines, 'للتواصل مع المعهد: 0544020043'].join('\n')
    : [`שלום${name}, זו שרה ממכון ילדי הקסם. כפי שדיברנו, הנה הקישורים:`, '', ...lines, 'ליצירת קשר עם המכון: 0544020043'].join('\n');

  const wa = await sendInstituteWhatsAppText({ toPhone: phone, body: message });
  if (!wa.ok) {
    return NextResponse.json({
      success: false, error: 'whatsapp_send_failed', details: wa.error,
      instruction: 'Do not say the message was sent. Apologise and offer escalate_to_human.',
    }, { status: 502 });
  }
  return NextResponse.json({
    success: true, sent_links: keys, whatsapp_message_id: wa.id,
    sent_to: phone, used_caller_id: !dictated && !!callerId, sent_to_local: '0' + phone.slice(4),
  });
}
