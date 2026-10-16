import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const schema = z.object({ case_id: z.string().uuid().nullable() }).strict();

/** Staff link or unlink a voice call to an ADHD case. */
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

  if (parsed.data.case_id) {
    const c = await db.from('intake_sessions').select('id').eq('id', parsed.data.case_id).maybeSingle();
    if (c.error) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
    if (!c.data) return NextResponse.json({ error: 'case_not_found' }, { status: 404 });
  }

  const raw = (call.data.raw_summary as Record<string, unknown> | null) ?? {};
  const { error } = await db.from('voice_calls').update({
    linked_case_id: parsed.data.case_id,
    raw_summary: { ...raw, case_link_method: parsed.data.case_id ? 'staff' : 'staff_unlinked',
      case_linked_by: staff.id, case_linked_at: new Date().toISOString() },
  }).eq('id', params.id);
  if (error) return NextResponse.json({ error: 'update_failed' }, { status: 500 });
  return NextResponse.json({ success: true });
}
