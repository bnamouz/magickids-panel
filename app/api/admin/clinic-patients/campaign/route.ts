import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStaff, isAdmin } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { campaigns, pause, resume } from '@/lib/clinic-patients/campaign';
export const dynamic = 'force-dynamic';
const reply = (b: unknown, s = 200) => NextResponse.json(b, { status: s, headers: { 'Cache-Control': 'private, no-store' } });
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'forbidden' }, 403);
  const staff = await getCurrentStaff(); if (!staff || !isAdmin(staff)) return reply({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const cid = typeof b.cid === 'string' && /^[a-z0-9-]{3,60}$/.test(b.cid) ? b.cid : null;
  if ((b.action === 'pause' || b.action === 'resume') && cid) {
    const ok = b.action === 'pause' ? await pause(cid) : await resume(cid);
    await getSupabaseAdmin().from('audit_log').insert({ actor_id: staff.id, actor_type: 'user', action: `clinic_campaign_${b.action}`, entity_type: 'clinic_campaign', metadata: { cid } });
    if (!ok) return reply({ error: 'unavailable' }, 503);
  }
  return reply({ campaigns: await campaigns() });
}
