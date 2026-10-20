import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { cancelAppointment } from '@/lib/appointments/cancel';

export const dynamic = 'force-dynamic';

/** Maintenance: cancel a panel appointment on the owner's instruction (header x-campaign-secret). Same logic as the admin button. */
export async function POST(req: NextRequest) {
  const secret = process.env.CLINIC_CAMPAIGN_SECRET ?? '', given = req.headers.get('x-campaign-secret') ?? '';
  if (secret.length < 16 || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const parsed = z.object({ appointment_id: z.string().uuid(), reason: z.string().max(1000).optional() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const result = await cancelAppointment(parsed.data.appointment_id, parsed.data.reason ?? null, { id: 'maintenance', type: 'system' });
  return NextResponse.json(result, { status: result.ok ? 200 : result.error === 'not_found' ? 404 : result.error === 'sync_pending' ? 409 : 503 });
}
