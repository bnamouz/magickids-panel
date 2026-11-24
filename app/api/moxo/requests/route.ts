import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { moxoSchema } from '@/lib/moxo/schema';
import { fileKind } from '@/lib/shared/file-kind';
import { MAX_REFERRAL_BYTES, MAX_REFERRALS_PER_DAY, REFERRAL_BUCKET, referralPath } from '@/lib/moxo/referral';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
type Referral = { bytes: Buffer; type: string; ext: string };
type Incoming = { input: unknown; referral: Referral | null } | { error: string; status: number };

/** The form posts multipart so the physician's referral can travel with the details; a plain JSON body is still accepted. */
async function read(req: NextRequest): Promise<Incoming> {
  if (!(req.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
    const raw = await req.text();
    return raw.length > 3000 ? { error: 'invalid_request', status: 400 } : { input: JSON.parse(raw), referral: null };
  }
  if (Number(req.headers.get('content-length') || 0) > MAX_REFERRAL_BYTES + 100_000) return { error: 'too_large', status: 413 };
  const form = await req.formData();
  const text = (key: string) => { const v = form.get(key); return typeof v === 'string' && v !== '' ? v : undefined; };
  const input = {
    id: text('id'), patient_name: text('patient_name'), contact_name: text('contact_name'), phone: text('phone'), national_id: text('national_id'), language: text('language'),
    preferred_date: text('preferred_date'), preferred_start: text('preferred_start'), consent: form.get('consent') === 'true', website: text('website') ?? '',
  };
  const file = form.get('referral');
  if (!(file instanceof File) || file.size === 0) return { input, referral: null };
  if (file.size > MAX_REFERRAL_BYTES) return { error: 'too_large', status: 413 };
  if (file.size < 100) return { error: 'invalid_file', status: 400 };
  const bytes = Buffer.from(await file.arrayBuffer()), kind = fileKind(bytes);
  return kind ? { input, referral: { bytes, type: kind.type, ext: kind.ext } } : { error: 'invalid_file', status: 400 };
}

type Db = ReturnType<typeof getSupabaseAdmin>;
/** Keeps the referral beside a saved request. A failure never loses the request: the family is asked to send the referral on WhatsApp. */
async function storeReferral(db: Db, id: string, file: Referral): Promise<'stored' | 'not_stored'> {
  try {
    const row = await db.from('moxo_requests').select('referral_path').eq('id', id).maybeSingle();
    if (row.error || !row.data) return 'not_stored';
    if (row.data.referral_path) return 'stored'; // the same request sent again
    const recent = await db.from('moxo_requests').select('id', { count: 'exact', head: true }).gt('referral_uploaded_at', new Date(Date.now() - 864e5).toISOString());
    if (recent.error || (recent.count ?? 0) >= MAX_REFERRALS_PER_DAY) return 'not_stored';
    const path = referralPath(id, file.ext);
    const up = await db.storage.from(REFERRAL_BUCKET).upload(path, file.bytes, { contentType: file.type, upsert: true, cacheControl: '0' });
    if (up.error) return 'not_stored';
    const saved = await db.from('moxo_requests').update({ referral_path: path, referral_type: file.type, referral_uploaded_at: new Date().toISOString() }).eq('id', id).is('referral_path', null);
    if (saved.error) { await db.storage.from(REFERRAL_BUCKET).remove([path]); return 'not_stored'; }
    return 'stored';
  } catch { return 'not_stored'; }
}

export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'forbidden' }, 403);
  try {
    const incoming = await read(req);
    if ('error' in incoming) return reply({ error: incoming.error }, incoming.status);
    const { consent, website, ...body } = moxoSchema.parse(incoming.input);
    const db = getSupabaseAdmin();
    // No messages or appointments are created by this public endpoint.
    const result = await db.rpc('submit_identified_moxo', { p_id: body.id, p_patient: body.patient_name, p_contact: body.contact_name, p_phone: body.phone, p_language: body.language, p_date: body.preferred_date ?? null, p_start: body.preferred_start ?? null, p_national_id: body.national_id });
    if (result.error) return reply({ error: 'unavailable' }, 503);
    if (result.data !== 'pending') return reply({ error: result.data }, result.data === 'rate_limited' ? 429 : 400);
    const referral = incoming.referral ? { referral: await storeReferral(db, body.id, incoming.referral) } : {};
    return reply({ received: true, status: 'pending', reference: body.id, ...referral });
  } catch { return reply({ error: 'invalid_request' }, 400); }
}
