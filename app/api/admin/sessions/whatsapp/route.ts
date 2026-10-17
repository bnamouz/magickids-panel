import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { notifyOnce } from '@/lib/moxo/notification';
import { normalisePhone } from '@/lib/voice-auth';
import { firstRelated } from '@/lib/intake/progress';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const Body = z.object({ session_id: z.string().uuid(), text: z.string().trim().min(2).max(1000), request_id: z.string().uuid() });

/** Staff reply to an ADHD case parent on WhatsApp — always from the institute number (054-402-0043). */
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'forbidden' }, 403);
  const staff = await getCurrentStaff();
  if (!staff) return reply({ error: 'forbidden' }, 403);
  let raw: unknown; try { raw = await req.json(); } catch { return reply({ error: 'invalid_request' }, 400); }
  const p = Body.safeParse(raw);
  if (!p.success) return reply({ error: 'invalid_request' }, 400);
  const db = getSupabaseAdmin();
  const s = await db.from('intake_sessions').select('id, parents(phone)').eq('id', p.data.session_id).single();
  if (s.error || !s.data) return reply({ error: 'not_found' }, 404);
  const to = normalisePhone(firstRelated<any>(s.data.parents)?.phone);
  if (!to || !/^\+9725\d{8}$/.test(to)) return reply({ error: 'not_mobile' }, 400);
  const state = await notifyOnce(`case-wa:${p.data.request_id}`, to, p.data.text, { sender: 'institute' });
  if (state !== 'accepted') return reply({ error: 'send_failed', state }, 502);
  await db.from('audit_log').insert({ actor_id: staff.id, actor_type: 'user', action: 'case_whatsapp_reply', entity_type: 'intake_session', entity_id: s.data.id, metadata: { length: p.data.text.length } });
  return reply({ sent: true });
}
