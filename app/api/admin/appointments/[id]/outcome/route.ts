import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** Staff records what happened at a past visit (attended / no-show) or reopens it.
 *  Only visits whose time has passed can get an outcome; cancellation has its own route. */
const schema = z.object({ status: z.enum(['attended', 'no_show', 'scheduled']) });
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await getCurrentStaff();
  if (!staff || req.headers.get('origin') !== req.nextUrl.origin) return json({ error: 'forbidden' }, 403);
  const id = z.string().uuid().safeParse(params.id);
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!id.success || !body.success) return json({ error: 'invalid_request' }, 400);
  const db = getSupabaseAdmin();
  const found = await db.from('appointments').select('id,status,scheduled_at,appointment_type,session_id').eq('id', id.data).maybeSingle();
  if (found.error) return json({ error: 'unavailable' }, 503);
  if (!found.data) return json({ error: 'not_found' }, 404);
  const a = found.data;
  const next = body.data.status;
  if (a.status === 'cancelled') return json({ error: 'הפגישה בוטלה; לא ניתן לשנות את תוצאתה.' }, 409);
  if (next !== 'scheduled' && Date.parse(a.scheduled_at) > Date.now()) return json({ error: 'אפשר לסמן התקיים / לא הופיע רק אחרי מועד הפגישה.' }, 409);
  if (!['scheduled', 'confirmed', 'attended', 'no_show'].includes(a.status)) return json({ error: 'invalid_state' }, 409);
  if (a.status === next) return json({ ok: true, status: next });
  const updated = await db.from('appointments').update({ status: next, updated_at: new Date().toISOString() }).eq('id', a.id).eq('status', a.status).select('id').maybeSingle();
  if (updated.error || !updated.data) return json({ error: 'הפגישה עודכנה בינתיים. רעננו את הדף.' }, 409);
  await db.from('audit_log').insert({ actor_id: staff.id, actor_type: 'user', action: 'appointment_outcome', entity_type: 'appointment', entity_id: a.id,
    metadata: { from: a.status, to: next, scheduled_at: a.scheduled_at, type: a.appointment_type, session_id: a.session_id, via: 'admin' } }).then(() => null, () => null);
  return json({ ok: true, status: next });
}
