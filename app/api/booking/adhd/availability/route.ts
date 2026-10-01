import { NextRequest, NextResponse } from 'next/server';
import { BookingError, checkIntake, getSlots, intakeTokenSchema } from '@/lib/booking/server';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'invalid_origin' }, 403);
  if (!req.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'invalid_body' }, 400);
  try {
    const raw = await req.text();
    if (raw.length > 1024) return reply({ error: 'invalid_body' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: 'invalid_body' }, 400); }
    const token = intakeTokenSchema.safeParse(body?.parentToken);
    if (!token.success) return reply({ error: 'invalid_intake' }, 403);
    await checkIntake(token.data);
    return reply({ clinic: 'adhd', slots: await getSlots('adhd'), durationMinutes: 60 });
  } catch (error) {
    return error instanceof BookingError ? reply({ error: error.code }, error.status) : reply({ error: 'unavailable' }, 503);
  }
}
