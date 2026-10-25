import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getCurrentStaff, canEditReports } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { mailConfigured, sender } from '@/lib/therapists/mail';
import {
  MACCABI_ALLOWED_TYPES, MACCABI_CHILDREN_CENTER_EMAIL, MACCABI_MAX_FILES, MACCABI_MAX_FILE_BYTES, MACCABI_MAX_TOTAL_BYTES,
  maccabiBody, maccabiSubject, sendMailWithAttachments, type MailAttachment,
} from '@/lib/maccabi/send-files';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const BUCKET = 'reports';
const prefix = (sessionId: string) => `maccabi/${sessionId}/`;

async function guard(req: NextRequest) {
  const staff = await getCurrentStaff();
  if (!canEditReports(staff)) return { error: reply({ error: 'forbidden' }, 403) };
  if (req.headers.get('origin') !== req.nextUrl.origin) return { error: reply({ error: 'forbidden' }, 403) };
  return { staff: staff! };
}

/** PUT – signed direct-to-storage upload URL for one extra file (scans, forms). */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req); if ('error' in g) return g.error;
  const { id } = await params;
  const body = z.object({ filename: z.string().min(1).max(200), type: z.string(), size: z.number().int().positive() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return reply({ error: 'invalid_body' }, 400);
  const ext = MACCABI_ALLOWED_TYPES[body.data.type];
  if (!ext) return reply({ error: 'unsupported_type' }, 400);
  if (body.data.size > MACCABI_MAX_FILE_BYTES) return reply({ error: 'file_too_large' }, 400);
  const db = getSupabaseAdmin();
  const { data: session } = await db.from('intake_sessions').select('id').eq('id', id).maybeSingle();
  if (!session) return reply({ error: 'not_found' }, 404);
  const path = `${prefix(id)}${randomUUID()}.${ext}`;
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return reply({ error: 'storage_unavailable' }, 503);
  return reply({ path, signedUrl: data.signedUrl, token: data.token, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' });
}

const SendSchema = z.object({
  report_ids: z.array(z.string().uuid()).max(MACCABI_MAX_FILES).default([]),
  uploads: z.array(z.object({ path: z.string().min(1), filename: z.string().min(1).max(200) })).max(MACCABI_MAX_FILES).default([]),
  note: z.string().max(2000).optional(),
  recipient: z.enum(['maccabi', 'self']).default('maccabi'),
});

/** POST – email the selected report PDFs + uploaded files to Maccabi (or to the institute mailbox as a test). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req); if ('error' in g) return g.error;
  const { id } = await params;
  const parsed = SendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply({ error: 'invalid_body' }, 400);
  const { report_ids, uploads, note, recipient } = parsed.data;
  if (report_ids.length + uploads.length === 0) return reply({ error: 'no_files' }, 400);
  if (report_ids.length + uploads.length > MACCABI_MAX_FILES) return reply({ error: 'too_many_files' }, 400);
  if (!mailConfigured()) return reply({ error: 'mail_not_configured' }, 503);
  if (uploads.some((u) => !u.path.startsWith(prefix(id)) || u.path.includes('..'))) return reply({ error: 'invalid_body' }, 400);

  const db = getSupabaseAdmin();
  const { data: session } = await db.from('intake_sessions')
    .select('id, patients ( first_name, last_name, national_id, birth_date )').eq('id', id).maybeSingle();
  if (!session) return reply({ error: 'not_found' }, 404);
  const patient = (Array.isArray(session.patients) ? session.patients[0] : session.patients) as { first_name: string | null; last_name: string | null; national_id: string | null; birth_date: string | null } | null;
  const childName = `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.replace(/\s+/g, ' ').trim() || 'ילד/ה';
  const birthDate = patient?.birth_date ? new Date(patient.birth_date).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : null;

  const attachments: MailAttachment[] = [];
  let total = 0;
  const pull = async (path: string) => {
    const dl = await db.storage.from(BUCKET).download(path);
    if (dl.error || !dl.data) throw new Error('file_missing');
    const buf = Buffer.from(await dl.data.arrayBuffer());
    total += buf.length;
    if (buf.length > MACCABI_MAX_FILE_BYTES || total > MACCABI_MAX_TOTAL_BYTES) throw new Error('too_large');
    return buf;
  };
  try {
    if (report_ids.length) {
      const { data: reports } = await db.from('reports').select('id, pdf_storage_path, created_at').eq('session_id', id).in('id', report_ids);
      if (!reports || reports.length !== report_ids.length || reports.some((r) => !r.pdf_storage_path)) return reply({ error: 'report_missing' }, 400);
      for (const r of reports) {
        const day = new Date(r.created_at).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }).replace(/\./g, '-');
        attachments.push({ filename: `דוח אבחון קשב – ${childName} – ${day}.pdf`, contentType: 'application/pdf', content: await pull(r.pdf_storage_path!) });
      }
    }
    for (const u of uploads) {
      const ext = u.path.split('.').pop()!.toLowerCase();
      const contentType = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';
      const base = u.filename.replace(/[\\/:*?"<>|\r\n]/g, ' ').trim().replace(/\.(pdf|png|jpe?g)$/i, '');
      attachments.push({ filename: `${base || 'מסמך'}.${ext}`, contentType, content: await pull(u.path) });
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : 'unknown';
    return reply({ error: m === 'too_large' ? 'too_large' : 'file_missing' }, 400);
  }

  const to = recipient === 'self' ? sender : MACCABI_CHILDREN_CENTER_EMAIL;
  const files = attachments.map((a) => a.filename);
  const messageId = randomUUID();
  let gmailId: string;
  try {
    gmailId = await sendMailWithAttachments({
      to, messageId,
      subject: maccabiSubject({ childName, nationalId: patient?.national_id }),
      text: maccabiBody({ childName, nationalId: patient?.national_id, birthDate, files, note, staffName: g.staff.full_name }),
      attachments,
    });
  } catch {
    return reply({ error: 'send_failed' }, 502);
  }

  await db.from('audit_log').insert({
    actor_id: g.staff.id, actor_type: 'user', action: 'files_emailed_to_maccabi', entity_type: 'intake_session', entity_id: id,
    metadata: { to, recipient, files, report_ids, gmail_message_id: gmailId, bytes: total, has_note: Boolean(note?.trim()) },
  });
  if (uploads.length) await db.storage.from(BUCKET).remove(uploads.map((u) => u.path)); // temp copies only; the email is the record
  return reply({ ok: true, to, files, sent_at: new Date().toISOString() });
}
