import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const schema = z.object({ done: z.boolean() }).strict();

/** Staff mark a voice call as handled (or reopen it) in the dashboard follow-up queue. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await getCurrentStaff();
  if (!staff || req.headers.get('origin') !== req.nextUrl.origin)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!z.string().uuid().safeParse(params.id).success)
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const db = getSupabaseAdmin();
  const call = await db.from('voice_calls').select('id, raw_summary').eq('id', params.id).maybeSingle();
  if (call.error) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  if (!call.data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const raw = (call.data.raw_summary as Record<string, unknown> | null) ?? {};
  const next = parsed.data.done
    ? { ...raw, follow_up_done_at: new Date().toISOString(), follow_up_done_by: staff.id }
    : { ...raw, follow_up_done_at: null, follow_up_done_by: null };
  const { error } = await db.from('voice_calls').update({ raw_summary: next }).eq('id', params.id);
  if (error) return NextResponse.json({ error: 'update_failed' }, { status: 500 });
  return NextResponse.json({ success: true });
}
