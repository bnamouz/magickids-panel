import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { mailConfigured } from '@/lib/therapists/mail';
import { asciiDigits } from '@/lib/phone-digits';
import { MACCABI_ALLOWED_TYPES, MACCABI_MAX_FILES, MACCABI_MAX_FILE_BYTES, MACCABI_MAX_TOTAL_BYTES, type MailAttachment } from '@/lib/maccabi/send-files';
import { createCommitment } from '@/lib/maccabi/commitment-service';
import { REQUEST_KINDS, isDrugKind, recipientFor, type RequestKind } from '@/lib/maccabi/commitment-shared';
import { guard, reply } from '../_guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const BUCKET = 'maccabi-outbox';
const PREFIX = 'commitments/';

/** GET – the desk list (open requests first, then the last 60 days of closed ones). */
export async function GET(req: NextRequest) {
  const g = await guard(req); if ('error' in g) return g.error;
  const db = getSupabaseAdmin();
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const { data, error } = await db.from('maccabi_commitments').select('*').or(`status.in.(sent,reminded,reply_received),updated_at.gte.${since}`).order('sent_at', { ascending: false }).limit(200);
  if (error) return reply({ error: 'db' }, 503);
  return reply({ commitments: data ?? [] });
}

/** PUT – signed upload URL for a referral / document to attach to the request. */
export async function PUT(req: NextRequest) {
  const g = await guard(req, true); if ('error' in g) return g.error;
  const body = z.object({ filename: z.string().min(1).max(200), type: z.string(), size: z.number().int().positive() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return reply({ error: 'invalid_body' }, 400);
  const ext = MACCABI_ALLOWED_TYPES[body.data.type];
  if (!ext) return reply({ error: 'unsupported_type' }, 400);
  if (body.data.size > MACCABI_MAX_FILE_BYTES) return reply({ error: 'file_too_large' }, 400);
  const path = `${PREFIX}${g.staff.id}/${randomUUID()}.${ext}`;
  const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return reply({ error: 'storage_unavailable' }, 503);
  return reply({ path, signedUrl: data.signedUrl, token: data.token, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' });
}

const CreateSchema = z.object({
  kind: z.enum(REQUEST_KINDS as [RequestKind, ...RequestKind[]]).default('commitment'),
  clinic_patient_id: z.string().uuid().nullable().optional(),
  patient_name: z.string().trim().min(2).max(160),
  national_id: z.string().transform(asciiDigits).pipe(z.string().regex(/^[0-9]{5,9}$/)),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal('')),
  phone: z.string().transform((v) => asciiDigits(v).replace(/[^0-9]/g, '')).pipe(z.string().regex(/^0[0-9]{8,9}$/)),
  service: z.string().trim().min(2).max(200),
  note: z.string().max(2000).optional(),
  uploads: z.array(z.object({ path: z.string().min(1), filename: z.string().min(1).max(200) })).max(MACCABI_MAX_FILES).default([]),
  test_to_self: z.boolean().default(false),
  /** drug_appeal only: the drug_approval row this appeal is about. */
  appeal_of: z.string().uuid().nullable().optional(),
  /** Drug kinds only, never in test mode: one WhatsApp to the family once the request was e-mailed and saved. */
  notify_family: z.boolean().default(false),
  lang: z.enum(['he', 'ar']).default('he'),
});
const ERRORS: Record<string, [string, number]> = {
  db_insert_failed: ['db', 502], imaging_not_ready: ['imaging_not_ready', 503], drugs_not_ready: ['drugs_not_ready', 503],
  appeal_address_missing: ['appeal_address_missing', 503], appeal_not_found: ['appeal_not_found', 400],
};

/** POST – send the request (commitment → branch, imaging approval → imaging center, drug approval → drug approvals department, drug appeal → appeal mailbox) and start tracking it. */
export async function POST(req: NextRequest) {
  const g = await guard(req, true); if ('error' in g) return g.error;
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply({ error: 'invalid_body', fields: parsed.error.issues.map((i) => String(i.path[0])) }, 400);
  if (!mailConfigured()) return reply({ error: 'mail_not_configured' }, 503);
  const d = parsed.data;
  // An imaging approval request is meaningless without the recommendation document.
  if (d.kind === 'imaging' && d.uploads.length === 0) return reply({ error: 'recommendation_required' }, 400);
  if (d.appeal_of && d.kind !== 'drug_appeal') return reply({ error: 'invalid_body', fields: ['appeal_of'] }, 400);
  if (isDrugKind(d.kind)) {
    // Diagnosis and medical justification (appeal: the appeal reasons) are the core of the letter.
    if ((d.note ?? '').trim().length < 10) return reply({ error: 'justification_required' }, 400);
    // A drug approval request needs the recommending specialist's letter; files are optional for an appeal.
    if (d.kind === 'drug_approval' && d.uploads.length === 0) return reply({ error: 'recommendation_required' }, 400);
    // The appeal mailbox is not known yet: never guess an address.
    if (d.kind === 'drug_appeal' && !d.test_to_self && !recipientFor('drug_appeal')) return reply({ error: 'appeal_address_missing' }, 503);
  }
  if (d.uploads.some((u) => !u.path.startsWith(`${PREFIX}${g.staff.id}/`) || u.path.includes('..'))) return reply({ error: 'invalid_body' }, 400);
  const db = getSupabaseAdmin();
  const attachments: MailAttachment[] = [];
  let total = 0;
  try {
    for (const u of d.uploads) {
      const dl = await db.storage.from(BUCKET).download(u.path);
      if (dl.error || !dl.data) throw new Error('file_missing');
      const buf = Buffer.from(await dl.data.arrayBuffer());
      total += buf.length;
      if (buf.length > MACCABI_MAX_FILE_BYTES || total > MACCABI_MAX_TOTAL_BYTES) throw new Error('too_large');
      const ext = u.path.split('.').pop()!.toLowerCase();
      const base = u.filename.replace(/[\\/:*?"<>|\r\n]/g, ' ').trim().replace(/\.(pdf|png|jpe?g)$/i, '');
      attachments.push({ filename: `${base || 'מסמך'}.${ext}`, contentType: ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg', content: buf });
    }
  } catch (e) { return reply({ error: e instanceof Error && e.message === 'too_large' ? 'too_large' : 'file_missing' }, 400); }
  try {
    const row = await createCommitment({
      kind: d.kind, clinicPatientId: d.clinic_patient_id ?? null, patientName: d.patient_name, nationalId: d.national_id, birthDate: d.birth_date || null, phone: d.phone,
      service: d.service, note: d.note, staffName: g.staff.full_name, createdBy: g.staff.id, files: attachments, testToSelf: d.test_to_self,
      appealOf: d.kind === 'drug_appeal' ? d.appeal_of ?? null : null, notifyFamily: isDrugKind(d.kind) && d.notify_family && !d.test_to_self, lang: d.lang,
    });
    if (d.uploads.length) await db.storage.from(BUCKET).remove(d.uploads.map((u) => u.path));
    const { family_notice, ...commitment } = row;
    return reply({ ok: true, commitment, family_notice });
  } catch (e) {
    const [error, status] = ERRORS[e instanceof Error ? e.message : ''] ?? ['send_failed', 502];
    return reply({ error }, status);
  }
}
