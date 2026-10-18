import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { notifyOnce } from '@/lib/moxo/notification';
import { newBookingToken, tokenHash } from '@/lib/booking/payment-tokens';

export const dynamic = 'force-dynamic';
const reply = (b: unknown, s = 200) => NextResponse.json(b, { status: s, headers: { 'Cache-Control': 'private, no-store' } });
const body = z.object({ action: z.enum(['proof', 'approve', 'reject']), id: z.string().uuid(), note: z.string().trim().max(300).optional() });

function approvedText(lang: string, visitType: string, link: string) {
  const assess = visitType === 'assessment';
  if (lang === 'ar') return `مرحبًا، تم تأكيد الدفع في معهد أطفال السحر. لاختيار موعد ${assess ? 'تشخيص الانتباه والتركيز' : 'زيارة المتابعة'} افتحوا الرابط الشخصي:\n${link}${assess ? '\nقبل التشخيص يجب إكمال استبيان الأهل واستبيان المعلم؛ سيُطلب منكم لصق رابط الاستبيان.' : ''}`;
  if (lang === 'en') return `Hello, your payment to Magic Kids Institute was confirmed. To choose a time for the ${assess ? 'ADHD assessment' : 'follow-up visit'}, open your personal link:\n${link}${assess ? '\nBefore the assessment, the parent and teacher questionnaires must be completed; you will be asked to paste the questionnaire link.' : ''}`;
  return `שלום, התשלום למכון ילדי הקסם אושר. לבחירת מועד ל${assess ? 'אבחון קשב וריכוז' : 'ביקור המעקב'} פתחו את הקישור האישי:\n${link}${assess ? '\nלפני האבחון יש להשלים את שאלון ההורה ושאלון המורה; בקישור תתבקשו להדביק את קישור השאלון.' : ''}`;
}
function rejectedText(lang: string, note?: string) {
  if (lang === 'ar') return `مرحبًا، لم نتمكن من تأكيد الدفع لمعهد أطفال السحر.${note ? ` ${note}` : ''} للاستفسار: واتساب 054-402-0043.`;
  if (lang === 'en') return `Hello, we could not confirm your payment to Magic Kids Institute.${note ? ` ${note}` : ''} Questions: WhatsApp 054-402-0043.`;
  return `שלום, לא הצלחנו לאמת את התשלום למכון ילדי הקסם.${note ? ` ${note}` : ''} לבירור: וואטסאפ 054-402-0043.`;
}

export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'forbidden' }, 403);
  const staff = await getCurrentStaff();
  if (!staff || !['admin', 'assistant'].includes(staff.role)) return reply({ error: 'forbidden' }, 403);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply({ error: 'invalid' }, 400);
  const { action, id, note } = parsed.data;
  const db = getSupabaseAdmin();
  const row = await db.from('adhd_payment_requests').select('*').eq('id', id).maybeSingle();
  if (row.error) return reply({ error: 'unavailable' }, 503);
  if (!row.data) return reply({ error: 'not_found' }, 404);
  const r = row.data;
  if (action === 'proof') {
    const url = await db.storage.from('adhd-payments').createSignedUrl(r.proof_path, 300);
    if (url.error) return reply({ error: 'unavailable' }, 503);
    return reply({ url: url.data.signedUrl });
  }
  if (r.status === 'booked') return reply({ error: 'already_booked' }, 409);
  const now = new Date().toISOString();
  if (action === 'approve') {
    if (!['pending', 'approved'].includes(r.status)) return reply({ error: 'invalid_state' }, 409);
    const token = newBookingToken();
    const u = await db.from('adhd_payment_requests').update({ status: 'approved', booking_token_hash: tokenHash(token), reviewed_at: now, reviewed_by: staff.id, review_note: note ?? null, updated_at: now }).eq('id', id).in('status', ['pending', 'approved']);
    if (u.error) return reply({ error: 'unavailable' }, 503);
    const link = `https://app.magickidsinstitute.com/book/adhd?lang=${r.language}&visitType=${r.visit_type}#pay=${token}`;
    const whatsapp = await notifyOnce(`adhd-pay:${id}:approved:${tokenHash(token).slice(0, 8)}`, r.phone, approvedText(r.language, r.visit_type, link), { sender: 'institute' });
    await db.from('audit_log').insert({ actor_id: staff.id, actor_type: 'user', action: 'adhd_payment_approved', entity_type: 'adhd_payment_request', entity_id: id, metadata: { whatsapp } });
    return reply({ ok: true, link, whatsapp });
  }
  if (r.status !== 'pending') return reply({ error: 'invalid_state' }, 409);
  const u = await db.from('adhd_payment_requests').update({ status: 'rejected', booking_token_hash: null, reviewed_at: now, reviewed_by: staff.id, review_note: note ?? null, updated_at: now }).eq('id', id).eq('status', 'pending');
  if (u.error) return reply({ error: 'unavailable' }, 503);
  const whatsapp = await notifyOnce(`adhd-pay:${id}:rejected`, r.phone, rejectedText(r.language, note), { sender: 'institute' });
  await db.from('audit_log').insert({ actor_id: staff.id, actor_type: 'user', action: 'adhd_payment_rejected', entity_type: 'adhd_payment_request', entity_id: id, metadata: { whatsapp } });
  return reply({ ok: true, whatsapp });
}
