import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { confirmationKey, confirmationSchema, sendAppointmentConfirmation } from '@/lib/appointments/confirmation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await getCurrentStaff()) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().from('clinic_notifications').select('id,state')
    .in('id', [confirmationKey(params.id, 'email'), confirmationKey(params.id, 'whatsapp')]);
  if (error) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  return NextResponse.json({
    email: data?.find(r => r.id === confirmationKey(params.id, 'email'))?.state ?? 'not_requested',
    whatsapp: data?.find(r => r.id === confirmationKey(params.id, 'whatsapp'))?.state ?? 'not_requested',
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await getCurrentStaff() || req.headers.get('origin') !== req.nextUrl.origin)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const parsed = confirmationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'יש לאמת את הנמען ואת הסכמתו לערוצים שנבחרו' }, { status: 400 });
  return NextResponse.json(await sendAppointmentConfirmation(params.id, parsed.data));
}
