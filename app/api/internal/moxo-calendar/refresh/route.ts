import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { secretOk } from '@/lib/clinic-patients/campaign';
import { syncMoxoCalendar } from '@/lib/moxo/calendar';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
/** Internal maintenance: rewrite upcoming MOXO calendar events with the current title/description format. */
export async function POST(req: NextRequest) {
  if (!secretOk(req.headers.get('x-campaign-secret'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const r = await getSupabaseAdmin().from('moxo_requests').select('id').eq('status', 'approved').gt('scheduled_at', new Date(Date.now() - 864e5).toISOString()).limit(50);
  if (r.error) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  const out: Record<string, string> = {};
  for (const row of r.data ?? []) out[row.id] = await syncMoxoCalendar(row.id, true);
  return NextResponse.json({ refreshed: out });
}
