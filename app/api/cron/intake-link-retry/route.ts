import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { retryFailedIntakeLinks } from '@/lib/voice/intake-link-retry';
import { secretOk } from '@/lib/clinic-patients/campaign';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
/** Scheduled by GitHub Actions at 17:00 and 18:00 UTC; only the run that lands on 20:00–21:59 Israel time does the work (summer/winter clock). */
function cronAuth(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return !!secret && secret.length >= 32 && actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function run(req: NextRequest) {
  if (!cronAuth(req) && !secretOk(req.headers.get('x-campaign-secret'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const hour = Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }));
  if (![20, 21].includes(hour) && req.nextUrl.searchParams.get('force') !== '1') return NextResponse.json({ skipped: true, local_hour: hour });
  try { return NextResponse.json(await retryFailedIntakeLinks(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'unavailable' }, { status: 503 }); }
}
export const GET = run;
export const POST = run;
