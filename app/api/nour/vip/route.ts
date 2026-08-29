import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { normalisePhone } from '@/lib/nour-auth';
import { getCurrentStaff } from '@/lib/admin/auth';

/**
 * Admin CRUD for VIP list.
 * Uses staff auth (session cookie), not the Nour Bearer token.
 */
export const runtime = 'nodejs';

const AddSchema = z.object({
  phone: z.string().min(6),
  name: z.string().optional(),
  reason: z.string().optional(),
});

async function requireStaff() {
  const staff = await getCurrentStaff();
  if (!staff) return null;
  return staff;
}

export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('nour_vip_list')
    .select('*')
    .order('added_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vips: data || [] });
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: z.infer<typeof AddSchema>;
  try {
    body = AddSchema.parse(await req.json());
  } catch (e: any) {
    return NextResponse.json({ error: 'invalid_body', details: e?.errors }, { status: 400 });
  }

  const phone = normalisePhone(body.phone);
  if (!phone) return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('nour_vip_list')
    .upsert(
      {
        phone_e164: phone,
        name: body.name,
        reason: body.reason,
      },
      { onConflict: 'phone_e164' },
    )
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, vip: data });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('nour_vip_list').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
