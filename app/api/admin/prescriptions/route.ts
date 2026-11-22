import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { notifyOnce } from '@/lib/moxo/notification';
import { issuedText, rejectedText } from '@/lib/prescriptions/messages';

export const dynamic = 'force-dynamic';
const reply = (b: unknown, s = 200) => NextResponse.json(b, { status: s, headers: { 'Cache-Control': 'private, no-store' } });
const body = z.object({
  action: z.enum(['file', 'issue', 'reject']), id: z.string().uuid(),
  /** 0 is the payment proof; 1 to 3 are the assessment-summary files. */
  file: z.number().int().min(0).max(3).optional(),
  note: z.string().trim().max(300).refine(v => !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v)).optional(),
});

/** Manager only: view the attached files, mark a prescription as issued, or decline the request. */
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'forbidden' }, 403);
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== 'admin') return reply({ error: 'forbidden' }, 403);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply({ error: 'invalid' }, 400);
  const { action, id } = parsed.data, note = parsed.data.note || null;
  const db = getSupabaseAdmin();
  const row = await db.from('prescription_renewal_requests').select('*').eq('id', id).neq('status', 'uploading').maybeSingle();
  if (row.error) return reply({ error: 'unavailable' }, 503);
  if (!row.data) return reply({ error: 'not_found' }, 404);
  const r = row.data;
  if (action === 'file') {
    const index = parsed.data.file ?? 0, path = index === 0 ? r.proof_path : (r.summary_paths ?? [])[index - 1];
    if (!path) return reply({ error: 'not_found' }, 404);
    const url = await db.storage.from('adhd-payments').createSignedUrl(path, 300);
    if (url.error) return reply({ error: 'unavailable' }, 503);
    await db.from('audit_log').insert({ actor_id: staff.id, actor_type: 'user', action: 'prescription_renewal_file_viewed', entity_type: 'prescription_renewal_request', entity_id: id, metadata: { file: index === 0 ? 'proof' : `summary-${index}` } });
    return reply({ url: url.data.signedUrl });
  }
  if (r.status !== 'pending') return reply({ error: 'invalid_state' }, 409);
  const now = new Date().toISOString(), status = action === 'issue' ? 'issued' : 'rejected';
  const u = await db.from('prescription_renewal_requests').update({ status, reviewed_at: now, reviewed_by: staff.id, review_note: note, updated_at: now }).eq('id', id).eq('status', 'pending').select('id').maybeSingle();
  if (u.error) return reply({ error: 'unavailable' }, 503);
  if (!u.data) return reply({ error: 'invalid_state' }, 409);
  const text = action === 'issue' ? issuedText(r.language, r.patient_name, r.months, note) : rejectedText(r.language, r.patient_name, note);
  const whatsapp = await notifyOnce(`rx:${id}:${status}`, r.phone, text, { sender: 'institute' });
  await db.from('audit_log').insert({ actor_id: staff.id, actor_type: 'user', action: `prescription_renewal_${status}`, entity_type: 'prescription_renewal_request', entity_id: id, metadata: { whatsapp, months: r.months } });
  return reply({ ok: true, whatsapp });
}
