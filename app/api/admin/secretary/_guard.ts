import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStaff, type StaffUser } from '@/lib/admin/auth';
export const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
/** Any active staff member (admin / diagnostician / assistant) may use the secretary desk; mutations also need a same-origin request. */
export async function guard(req: NextRequest, mutation = false): Promise<{ staff: StaffUser } | { error: NextResponse }> {
  const staff = await getCurrentStaff();
  if (!staff) return { error: reply({ error: 'forbidden' }, 403) };
  if (mutation && req.headers.get('origin') !== req.nextUrl.origin) return { error: reply({ error: 'forbidden' }, 403) };
  return { staff };
}
