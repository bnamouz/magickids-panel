import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { sendDueReminders } from '@/lib/booking/reminders';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || secret.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try { return NextResponse.json(await sendDueReminders(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'unavailable' }, { status: 503 }); }
}
