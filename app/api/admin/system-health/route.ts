import { NextResponse } from 'next/server';
import { getCurrentStaff } from '@/lib/admin/auth';
import { runSystemHealth } from '@/lib/admin/system-health';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  const staff = await getCurrentStaff();
  if (staff?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ checks: await runSystemHealth(), at: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
