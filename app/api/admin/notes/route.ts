import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const schema = z.object({
  session_id: z.string().uuid(),
  content: z.string().min(1).max(5000),
  category: z.enum(['general', 'clinical', 'follow_up', 'flag']),
});

export async function POST(req: NextRequest) {
  const staff = await requireStaff();
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('clinical_notes')
    .insert({
      session_id: parsed.data.session_id,
      staff_id: staff.id,
      category: parsed.data.category,
      content: parsed.data.content,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // audit
  await supabase.from('audit_log').insert({
    session_id: parsed.data.session_id,
    actor: `staff:${staff.email}`,
    action: 'clinical_note_added',
    payload: { category: parsed.data.category, note_id: data.id },
  });

  return NextResponse.json({ ok: true, note: data });
}
