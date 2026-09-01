// app/api/marhaba/leads/[id]/route.ts
// Get / update / delete a single lead.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getCurrentStaff } from '@/lib/admin/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPDATABLE_FIELDS = new Set([
  'clinic_name', 'phone', 'city', 'contact_name', 'status', 'fit_score',
  'interest_level', 'notes', 'source', 'next_action_at',
]);

async function requireStaff() {
  const staff = await getCurrentStaff();
  return staff;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireStaff())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const id = parseInt(params.id, 10);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('marhaba_leads').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const { data: demos } = await supabase
    .from('marhaba_demos')
    .select('*')
    .eq('lead_id', id)
    .order('scheduled_at', { ascending: false });

  return NextResponse.json({ lead: data, demos: demos || [] });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireStaff())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const id = parseInt(params.id, 10);
  const body = await req.json().catch(() => ({}));

  const patch: any = {};
  for (const [k, v] of Object.entries(body)) {
    if (UPDATABLE_FIELDS.has(k)) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no updatable fields' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('marhaba_leads')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lead: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireStaff())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const id = parseInt(params.id, 10);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('marhaba_leads').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
