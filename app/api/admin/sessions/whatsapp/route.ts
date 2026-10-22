import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { notifyOnce } from '@/lib/moxo/notification';
import { normalisePhone } from '@/lib/voice-auth';
import { firstRelated } from '@/lib/intake/progress';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const Body = z.object({ session_id: z.string().uuid().optional(), referral_id: z.string().uuid().optional(), text: z.string().trim().min(2).max(1000), request_id: z.string().uuid() })
  .refine(b => !!b.session_id !== !!b.referral_id, { message: 'exactly one target' });

/** Staff reply to a parent on WhatsApp — ADHD case or child-development referral — always from the institute number (054-402-0043). */
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'forbidden' }, 403);
  const staff = await getCurrentStaff();
  if (!staff) return reply({ error: 'forbidden' }, 403);
  let raw: unknown; try { raw = await req.json(); } catch { return reply({ error: 'invalid_request' }, 400); }
  const p = Body.safeParse(raw);
  if (!p.success) return reply({ error: 'invalid_request' }, 400);
  const db = getSupabaseAdmin();
  let target: { id: string; phone: string | null | undefined; entity: 'intake_session' | 'development_referral' };
  if (p.data.session_id) {
    const s = await db.from('intake_sessions').select('id, parents(phone)').eq('id', p.data.session_id).single();
    if (s.error || !s.data) return reply({ error: 'not_found' }, 404);
    target = { id: s.data.id, phone: firstRelated<any>(s.data.parents)?.phone, entity: 'intake_session' };
  } else {
    const r = await db.from('development_referrals').select('id, phone').eq('id', p.data.referral_id!).single();
    if (r.error || !r.data) return reply({ error: 'not_found' }, 404);
    target = { id: r.data.id, phone: r.data.phone, entity: 'development_referral' };
  }
  const to = normalisePhone(target.phone);
  if (!to || !/^\+9725\d{8}$/.test(to)) return reply({ error: 'not_mobile' }, 400);
  const state = await notifyOnce(`case-wa:${p.data.request_id}`, to, p.data.text, { sender: 'institute' });
  if (state !== 'accepted') return reply({ error: 'send_failed', state }, 502);
  await db.from('audit_log').insert({ actor_id: staff.id, actor_type: 'user', action: 'case_whatsapp_reply', entity_type: target.entity, entity_id: target.id, metadata: { length: p.data.text.length } });
  return reply({ sent: true });
}
