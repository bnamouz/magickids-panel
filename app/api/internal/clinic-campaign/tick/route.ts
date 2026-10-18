import { NextRequest, NextResponse } from 'next/server';
import { secretOk, tick } from '@/lib/clinic-patients/campaign';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
// Called every ~30 s by the GitHub Actions driver. One message per call at most.
export async function POST(req: NextRequest) {
  if (!secretOk(req.headers.get('x-campaign-secret'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try { return NextResponse.json(await tick(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ status: 'unavailable' }, { status: 503 }); }
}
