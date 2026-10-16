import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff, isAdmin } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { patientSchema, parseBulk } from '@/lib/clinic-patients/schema';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const COLS = 'id,national_id,first_name,last_name,phone1,phone2,birth_date,last_visit,next_visit,notes,needs_review,source,updated_at,extra';

async function admin() { const s = await getCurrentStaff(); return isAdmin(s) ? s : null; }

/** CSV export (admin only). Excel-friendly UTF-8 with BOM. */
export async function GET(req: NextRequest) {
  if (!await admin()) return reply({ error: 'forbidden' }, 403);
  const r = await getSupabaseAdmin().from('clinic_patients').select(COLS).is('archived_at', null).order('last_name').limit(20000);
  if (r.error) return reply({ error: 'unavailable' }, 503);
  const head = ['ת.ז', 'שם פרטי', 'שם משפחה', 'טלפון 1', 'טלפון 2', 'תאריך לידה', 'ביקור אחרון', 'ביקור קרוב', 'הערות', 'לבדיקה', 'חסר גובה ומשקל'];
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [head.join(','), ...(r.data ?? []).map((p: any) => [p.national_id, p.first_name, p.last_name, p.phone1, p.phone2, p.birth_date, p.last_visit, p.next_visit, p.notes, p.needs_review ? 'כן' : '', p.extra?.missing_height_weight ? 'כן' : ''].map(esc).join(','))];
  return new NextResponse('\ufeff' + lines.join('\n'), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="clinic-patients-${new Date().toISOString().slice(0, 10)}.csv"` } });
}

export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'forbidden' }, 403);
  const staff = await admin();
  if (!staff) return reply({ error: 'forbidden' }, 403);
  let b: any;
  try { const raw = await req.text(); if (raw.length > 500_000) return reply({ error: 'too_large' }, 413); b = JSON.parse(raw); } catch { return reply({ error: 'invalid_request' }, 400); }
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();

  if (b.action === 'save') {
    const p = patientSchema.safeParse(b.patient);
    if (!p.success) return reply({ error: p.error.issues[0]?.message ?? 'invalid' }, 400);
    const { id, missing_height_weight, ...fields } = p.data;
    let extra: Record<string, unknown> = {};
    if (id) { const cur = await db.from('clinic_patients').select('extra').eq('id', id).single(); extra = (cur.data?.extra as any) ?? {}; }
    if (missing_height_weight !== undefined) extra = { ...extra, missing_height_weight };
    const row = { ...fields, extra, needs_review: fields.needs_review ?? false, updated_at: now, updated_by: staff.id };
    const q = id ? db.from('clinic_patients').update(row).eq('id', id) : db.from('clinic_patients').insert({ ...row, source: 'manual' });
    const r = await q.select('id').single();
    if (r.error) return reply({ error: r.error.code === '23505' ? 'id_exists' : 'save_failed' }, 409);
    return reply({ saved: true, id: r.data.id });
  }

  if (b.action === 'bulk') {
    if (typeof b.text !== 'string') return reply({ error: 'invalid_request' }, 400);
    const { ok, errors } = parseBulk(b.text);
    if (ok.length > 5000) return reply({ error: 'too_many_rows' }, 413);
    const seen = new Set<string>(); const unique = ok.filter(p => !seen.has(p.national_id) && seen.add(p.national_id));
    let inserted = 0, skipped = ok.length - unique.length;
    for (let i = 0; i < unique.length; i += 500) {
      const chunk = unique.slice(i, i + 500).map(({ id, missing_height_weight, ...p }) => ({ ...p, needs_review: p.needs_review ?? false, source: 'bulk', updated_by: staff.id }));
      const r = await db.from('clinic_patients').upsert(chunk, { onConflict: 'national_id', ignoreDuplicates: true }).select('id');
      if (r.error) return reply({ error: 'save_failed', inserted }, 409);
      inserted += r.data?.length ?? 0; skipped += chunk.length - (r.data?.length ?? 0);
    }
    return reply({ inserted, skipped_existing: skipped, invalid: errors.slice(0, 50), invalid_count: errors.length });
  }

  const id = z.string().uuid().safeParse(b.id);
  if (!id.success) return reply({ error: 'invalid_request' }, 400);
  const patch = b.action === 'archive' && b.confirmed === true ? { archived_at: now }
    : b.action === 'restore' ? { archived_at: null }
    : b.action === 'reviewed' ? { needs_review: false } : null;
  if (!patch) return reply({ error: 'invalid_request' }, 400);
  const r = await db.from('clinic_patients').update({ ...patch, updated_at: now, updated_by: staff.id }).eq('id', id.data).select('id').single();
  if (r.error) return reply({ error: 'save_failed' }, 409);
  return reply({ saved: true });
}
