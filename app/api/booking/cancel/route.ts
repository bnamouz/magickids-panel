import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BookingError, cancelPediatrics } from '@/lib/booking/server';
export const dynamic = 'force-dynamic';
const schema = z.object({ id: z.string().uuid(), token: z.string().regex(/^[a-f0-9]{64}$/), preview: z.boolean().default(false) }).strict();
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'forbidden' }, 403);
  try {
    const text = await req.text();
    if (text.length > 1024) return reply({ error: 'invalid_link' }, 400);
    const body = schema.parse(JSON.parse(text));
    return reply(await cancelPediatrics(body.id, body.token, body.preview));
  } catch (error) { return error instanceof BookingError ? reply({ error: error.code }, error.status) : reply({ error: 'unavailable' }, 503); }
}
