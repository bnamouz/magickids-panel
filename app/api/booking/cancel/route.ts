import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BookingError, cancelBooking } from '@/lib/booking/server';
import { getSupabaseAdmin } from '@/lib/supabase';
/** Diagnostic trail for the family's self-service cancel link (no personal data – booking id + outcome). */
async function trace(meta: Record<string, unknown>) {
  await getSupabaseAdmin().from('audit_log').insert({ actor_id: null, actor_type: 'parent', action: 'booking_cancel_link', entity_type: 'website_booking', entity_id: typeof meta.id === 'string' && /^[0-9a-f-]{36}$/.test(meta.id) ? meta.id : null, metadata: meta }).then(() => null, () => null);
}
export const dynamic = 'force-dynamic';
const schema = z.object({ id: z.string().uuid(), token: z.string().regex(/^[a-f0-9]{64}$/), preview: z.boolean().default(false), clinic: z.enum(['pediatrics', 'adhd']).default('pediatrics') }).strict();
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'forbidden' }, 403);
  try {
    const text = await req.text();
    if (text.length > 1024) return reply({ error: 'invalid_link' }, 400);
    const body = schema.parse(JSON.parse(text));
    const result = await cancelBooking(body.clinic, body.id, body.token, body.preview);
    await trace({ id: body.id, clinic: body.clinic, preview: body.preview, outcome: result.cancelled ? 'cancelled' : 'previewed' });
    return reply(result);
  } catch (error) {
    const code = error instanceof BookingError ? error.code : 'unavailable';
    await trace({ outcome: 'error', code, ...(error instanceof z.ZodError ? { code: 'bad_link_format' } : {}) });
    return error instanceof BookingError ? reply({ error: error.code }, error.status) : reply({ error: 'unavailable' }, 503);
  }
}
