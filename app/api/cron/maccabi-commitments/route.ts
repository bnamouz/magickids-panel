import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runDailyCheck } from '@/lib/maccabi/commitment-service';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
/** Daily (Sun–Thu morning, Israel): read Maccabi replies, notify families when a commitment is ready, remind the branch after 3 business days. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || secret.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try { return NextResponse.json(await runDailyCheck(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'unavailable' }, { status: 503 }); }
}
