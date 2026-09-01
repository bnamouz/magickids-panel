// app/api/marhaba/leads/route.ts
// List + create leads.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getCurrentStaff } from '@/lib/admin/auth';
import { normalizeIsraeliPhone } from '@/lib/marhaba/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireStaff() {
  const staff = await getCurrentStaff();
  if (!staff) return null;
  return staff;
}

export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const city = url.searchParams.get('city');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
  const withDashboard = url.searchParams.get('dashboard') === '1';

  const supabase = getSupabaseAdmin();

  let query = supabase.from('marhaba_leads').select('*');
  if (status) query = query.eq('status', status);
  if (city) query = query.eq('city', city);

  const { data: leads, error } = await query
    .order('fit_score', { ascending: false, nullsFirst: false })
    .order('imported_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let dashboard = null;
  if (withDashboard) {
    const { data: dash } = await supabase.from('marhaba_sales_dashboard').select('*').single();
    dashboard = dash;
  }

  return NextResponse.json({ leads: leads || [], dashboard });
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { clinic_name, phone, city, contact_name, source, fit_score, notes } = body;

  if (!clinic_name || !phone) {
    return NextResponse.json({ error: 'clinic_name and phone required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('marhaba_leads')
    .insert({
      clinic_name,
      phone: normalizeIsraeliPhone(phone),
      city: city || null,
      contact_name: contact_name || null,
      source: source || 'manual',
      status: 'new',
      fit_score: fit_score ?? 5,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lead: data });
}
