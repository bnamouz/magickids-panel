import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff, isAdmin } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { shareCalendar } from '@/lib/admin/calendar-sharing';

export const dynamic = 'force-dynamic';
const reply = (b: unknown, s = 200) => NextResponse.json(b, { status: s, headers: { 'Cache-Control': 'private, no-store' } });
const schema = z.object({ calendar: z.enum(['adhd', 'pediatrics']), email: z.string().trim().toLowerCase().email().max(254), role: z.enum(['reader', 'writer']) });

/** Admin-only: share a clinic Google Calendar with a Google account so it appears in Google Calendar. */
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'forbidden' }, 403);
  const staff = await getCurrentStaff();
  if (!staff || !isAdmin(staff)) return reply({ error: 'forbidden' }, 403);
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return reply({ error: 'invalid' }, 400);
  try {
    const result = await shareCalendar(p.data.calendar, p.data.email, p.data.role);
    await getSupabaseAdmin().from('audit_log').insert({ actor_id: staff.id, actor_type: 'user', action: 'google_calendar_shared', entity_type: 'google_calendar', metadata: { calendar: p.data.calendar, email: p.data.email, role: p.data.role, result } });
    return reply({ ok: true, result });
  } catch (e: any) {
    const code = Number(e?.code);
    return reply({ error: code === 403 ? 'no_permission' : code === 400 ? 'invalid_account' : 'unavailable' }, code === 403 ? 403 : 503);
  }
}
