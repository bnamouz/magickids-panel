import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { defaultClinicHours, localParts } from '@/lib/booking/schedule';
import { listOverrides } from '@/lib/booking/overrides';

export const dynamic = 'force-dynamic';
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'private, no-store' } });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d => new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d, 'תאריך לא תקין');
const hhmm = z.string().regex(/^\d{2}:\d{2}$/).transform(v => Number(v.slice(0, 2)) * 60 + Number(v.slice(3)));
const upsert = z.object({ mode: z.enum(['closed', 'hours']), clinic: z.enum(['pediatrics', 'adhd']), day, open: hhmm.optional(), close: hhmm.optional(), note: z.string().trim().max(200).optional() })
  .refine(v => v.mode === 'closed' || (v.open !== undefined && v.close !== undefined && v.close > v.open), { message: 'שעת הסגירה חייבת להיות אחרי הפתיחה' });

/** Day-level clinic hour overrides. Existing bookings are never changed; only which new slots are offered. */
export async function GET() {
  if (!await getCurrentStaff()) return json({ error: 'unauthorized' }, 401);
  try { return json({ overrides: await listOverrides(localParts(new Date()).date) }); } catch { return json({ error: 'לא ניתן לטעון כרגע' }, 503); }
}
export async function POST(req: NextRequest) {
  const staff = await getCurrentStaff();
  if (!staff || req.headers.get('origin') !== req.nextUrl.origin) return json({ error: 'unauthorized' }, 401);
  const parsed = upsert.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || 'בקשה לא תקינה' }, 400);
  const b = parsed.data;
  if (b.day < localParts(new Date()).date) return json({ error: 'אי אפשר לשנות יום שכבר עבר' }, 400);
  const row = { clinic: b.clinic, day: b.day, closed: b.mode === 'closed', open_min: b.mode === 'hours' ? b.open! : null, close_min: b.mode === 'hours' ? b.close! : null, note: b.note || null, created_by: staff.id, updated_at: new Date().toISOString() };
  const db = getSupabaseAdmin();
  const r = await db.from('clinic_day_overrides').upsert(row, { onConflict: 'clinic,day' });
  if (r.error) return json({ error: 'השמירה נכשלה' }, 503);
  await db.from('audit_log').insert({ actor_id: staff.id, actor_type: 'staff', action: 'clinic_day_override_set', entity_type: 'clinic_day_override', metadata: { ...row, default_hours: defaultClinicHours(b.clinic, b.day) } }).then(() => null, () => null);
  return json({ ok: true });
}
export async function DELETE(req: NextRequest) {
  const staff = await getCurrentStaff();
  if (!staff || req.headers.get('origin') !== req.nextUrl.origin) return json({ error: 'unauthorized' }, 401);
  const parsed = z.object({ clinic: z.enum(['pediatrics', 'adhd']), day }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'בקשה לא תקינה' }, 400);
  const db = getSupabaseAdmin();
  const r = await db.from('clinic_day_overrides').delete().eq('clinic', parsed.data.clinic).eq('day', parsed.data.day);
  if (r.error) return json({ error: 'המחיקה נכשלה' }, 503);
  await db.from('audit_log').insert({ actor_id: staff.id, actor_type: 'staff', action: 'clinic_day_override_removed', entity_type: 'clinic_day_override', metadata: parsed.data }).then(() => null, () => null);
  return json({ ok: true });
}
