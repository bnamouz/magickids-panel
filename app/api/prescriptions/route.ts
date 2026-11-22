import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { fileKind, renewalSchema, RENEWAL_FIELD_NAMES } from '@/lib/prescriptions/schema';
import { MAX_FILE_BYTES, MAX_SUMMARY_FILES, MAX_TOTAL_BYTES, RENEWAL_PRICE } from '@/lib/prescriptions/pricing';
import { recognisePatient } from '@/lib/prescriptions/match';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const BUCKET = 'adhd-payments', DAY = 864e5, MAX_ATTEMPTS = 12, MAX_REQUESTS = 5;
const headers = { 'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer' };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

/**
 * Public prescription-renewal request: details, payment proof and, when the institute has no documented assessment
 * for the patient, a previous assessment summary. Nothing is sent to the family here; the doctor decides in the panel.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'invalid_origin' }, 403);
  if (Number(req.headers.get('content-length') || 0) > MAX_TOTAL_BYTES + 300_000) return reply({ error: 'too_large' }, 413);
  const secret = process.env.BOOKING_HASH_SECRET;
  if (!secret || secret.length < 32) return reply({ error: 'unavailable' }, 503);
  let form: FormData; try { form = await req.formData(); } catch { return reply({ error: 'invalid_body' }, 400); }
  const fields: Record<string, unknown> = {};
  for (const k of RENEWAL_FIELD_NAMES) { const v = form.get(k); fields[k] = typeof v === 'string' ? (k === 'note' && !v.trim() ? undefined : v) : undefined; }
  const parsed = renewalSchema.safeParse(fields);
  if (!parsed.success) return reply({ error: 'invalid_body' }, 400);
  const b = parsed.data;

  const proof = form.get('proof');
  const summaries = form.getAll('summary').filter((f): f is File => f instanceof File && f.size > 0);
  if (!(proof instanceof File) || proof.size < 100) return reply({ error: 'invalid_file' }, 400);
  if (summaries.length > MAX_SUMMARY_FILES) return reply({ error: 'too_many' }, 400);
  const incoming = [proof, ...summaries];
  if (incoming.some(f => f.size > MAX_FILE_BYTES) || incoming.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES) return reply({ error: 'too_large' }, 413);
  const files: { path: string; bytes: Buffer; type: string }[] = [];
  for (const [i, f] of incoming.entries()) {
    if (f.size < 100) return reply({ error: 'invalid_file' }, 400);
    const bytes = Buffer.from(await f.arrayBuffer()), k = fileKind(bytes);
    if (!k) return reply({ error: 'invalid_file' }, 400);
    files.push({ path: `rx/${b.id}/${i === 0 ? 'proof' : `summary-${i}`}.${k.ext}`, bytes, type: k.type });
  }

  try {
    const db = getSupabaseAdmin();
    // A repeated send of the same request (lost reply, double tap) is answered without storing it twice.
    const same = await db.from('prescription_renewal_requests').select('id,status,patient_id').eq('id', b.id).maybeSingle();
    if (same.error) throw same.error;
    if (same.data) return same.data.patient_id === b.nationalId && same.data.status !== 'uploading' ? reply({ received: true, reference: b.id }) : reply({ error: 'duplicate' }, 409);

    const ipHash = createHmac('sha256', secret).update(`rx-ip:${req.ip || 'unknown'}`).digest('hex');
    const since = new Date(Date.now() - DAY).toISOString();
    const [attempts, requests] = await Promise.all([
      db.from('prescription_renewal_attempts').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gt('created_at', since),
      db.from('prescription_renewal_requests').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gt('created_at', since),
    ]);
    if (attempts.error || requests.error) throw attempts.error ?? requests.error;
    if ((attempts.count ?? 0) >= MAX_ATTEMPTS || (requests.count ?? 0) >= MAX_REQUESTS) return reply({ error: 'rate_limited' }, 429);
    const logged = await db.from('prescription_renewal_attempts').insert({ ip_hash: ipHash });
    if (logged.error) throw logged.error;

    const known = await recognisePatient(db, { nationalId: b.nationalId, birthDate: b.birthDate, patientName: b.patientName, phone: b.phone });
    if (known.recognition !== 'diagnosed' && !summaries.length) return reply({ error: 'summary_required' }, 409);

    const ins = await db.from('prescription_renewal_requests').insert({
      id: b.id, months: b.months, amount_ils: RENEWAL_PRICE[b.months], payment_method: b.method, patient_name: b.patientName, patient_id: b.nationalId, birth_date: b.birthDate,
      contact_name: b.contactName, phone: b.phone, fund: b.fund, medication: b.medication, note: b.note ?? null, language: b.language,
      proof_path: files[0].path, proof_type: files[0].type, summary_paths: files.slice(1).map(f => f.path),
      recognition: known.recognition, matched_patient_id: known.patientId, matched_session_id: known.sessionId, status: 'uploading', ip_hash: ipHash,
    });
    if (ins.error) throw ins.error;
    const discard = async () => { await db.storage.from(BUCKET).remove(files.map(f => f.path)); await db.from('prescription_renewal_requests').delete().eq('id', b.id).eq('status', 'uploading'); };
    for (const f of files) {
      const up = await db.storage.from(BUCKET).upload(f.path, f.bytes, { contentType: f.type, upsert: false, cacheControl: '0' });
      if (up.error) { await discard().catch(() => {}); throw up.error; }
    }
    const saved = await db.from('prescription_renewal_requests').update({ status: 'pending', updated_at: new Date().toISOString() }).eq('id', b.id).eq('status', 'uploading');
    if (saved.error) throw saved.error;
    return reply({ received: true, reference: b.id });
  } catch { return reply({ error: 'unavailable' }, 503); }
}
