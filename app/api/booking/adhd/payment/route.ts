import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { amountFor } from '@/lib/booking/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer' };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const name = z.string().trim().min(2).max(100).refine(v => !/[\r\n\x00-\x1f]/.test(v));
const schema = z.object({
  visitType: z.enum(['assessment', 'followup']),
  fund: z.enum(['clalit', 'meuhedet', 'leumit', 'private']),
  moxo: z.enum(['true', 'false']),
  method: z.enum(['bank', 'bit']),
  childName: name, childId: z.string().trim().regex(/^[0-9]{9}$/).refine(v => v !== '000000000'),
  parentName: name, phone: z.string().trim().regex(/^[+\d() .-]{7,25}$/),
  language: z.enum(['he', 'ar', 'en']).default('ar'),
  consent: z.literal('true'), website: z.literal(''),
});
const MAX = 5 * 1024 * 1024;
function kind(b: Buffer) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: 'image/png', ext: 'png' };
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return { type: 'application/pdf', ext: 'pdf' };
  return null;
}
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'invalid_origin' }, 403);
  if (Number(req.headers.get('content-length') || 0) > MAX + 200_000) return reply({ error: 'too_large' }, 413);
  const secret = process.env.BOOKING_HASH_SECRET;
  if (!secret || secret.length < 32) return reply({ error: 'unavailable' }, 503);
  let form: FormData; try { form = await req.formData(); } catch { return reply({ error: 'invalid_body' }, 400); }
  const fields: Record<string, unknown> = {};
  for (const k of ['visitType', 'fund', 'moxo', 'method', 'childName', 'childId', 'parentName', 'phone', 'language', 'consent', 'website']) fields[k] = form.get(k) ?? undefined;
  const parsed = schema.safeParse(fields);
  if (!parsed.success) return reply({ error: 'invalid_body' }, 400);
  const b = parsed.data;
  const digits = b.phone.replace(/\D/g, '');
  const phone = b.phone.startsWith('+') ? `+${digits}` : digits.startsWith('0') ? `+972${digits.slice(1)}` : `+${digits}`;
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return reply({ error: 'invalid_body' }, 400);
  const file = form.get('proof');
  if (!(file instanceof File) || file.size < 100 || file.size > MAX) return reply({ error: 'invalid_proof' }, 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  const k = kind(bytes); if (!k) return reply({ error: 'invalid_proof' }, 400);
  try {
    const db = getSupabaseAdmin();
    const ipHash = createHmac('sha256', secret).update(`pay-ip:${req.ip || 'unknown'}`).digest('hex');
    const recent = await db.from('adhd_payment_requests').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gt('created_at', new Date(Date.now() - 864e5).toISOString());
    if (recent.error) throw recent.error;
    if ((recent.count ?? 0) >= 5) return reply({ error: 'rate_limited' }, 429);
    const id = randomUUID(), path = `${id}.${k.ext}`;
    const moxo = b.visitType === 'assessment' && b.moxo === 'true';
    const ins = await db.from('adhd_payment_requests').insert({ id, visit_type: b.visitType, fund: b.fund, moxo, amount_ils: amountFor(b.visitType, moxo), payment_method: b.method,
      child_name: b.childName, child_id: b.childId, parent_name: b.parentName, phone, language: b.language, proof_path: path, proof_type: k.type, status: 'uploading', ip_hash: ipHash });
    if (ins.error) throw ins.error;
    const up = await db.storage.from('adhd-payments').upload(path, bytes, { contentType: k.type, upsert: false, cacheControl: '0' });
    if (up.error) { await db.from('adhd_payment_requests').delete().eq('id', id).eq('status', 'uploading'); throw up.error; }
    const saved = await db.from('adhd_payment_requests').update({ status: 'pending', updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'uploading');
    if (saved.error) throw saved.error;
    return reply({ received: true, reference: id });
  } catch { return reply({ error: 'unavailable' }, 503); }
}
