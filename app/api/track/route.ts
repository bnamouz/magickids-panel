import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { ALLOWED_ORIGINS, trackSchema } from '@/lib/analytics/schema';
export const dynamic = 'force-dynamic';

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp|telegram|python-requests|curl\//i;
const bucket = new Map<string, { n: number; until: number }>(); // best-effort per-instance limiter
function allowed(ip: string) {
  const now = Date.now(); const b = bucket.get(ip);
  if (!b || b.until < now) { bucket.set(ip, { n: 1, until: now + 60_000 }); return true; }
  b.n += 1; return b.n <= 120;
}
function cors(req: NextRequest, res: NextResponse) {
  const origin = req.headers.get('origin') ?? '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Vary', 'Origin');
    res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    res.headers.set('Access-Control-Max-Age', '86400');
  }
  return res;
}
export function OPTIONS(req: NextRequest) { return cors(req, new NextResponse(null, { status: 204 })); }

export async function POST(req: NextRequest) {
  const done = (status = 204) => cors(req, new NextResponse(null, { status }));
  const origin = req.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return done(403);
  if (BOT.test(req.headers.get('user-agent') ?? '')) return done();
  const ip = req.ip || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!allowed(ip)) return done(429);
  let raw: unknown;
  try { raw = JSON.parse(await req.text()); } catch { return done(400); }
  const parsed = trackSchema.safeParse(raw);
  if (!parsed.success) return done(400);
  const e = parsed.data;
  const city = req.headers.get('x-vercel-ip-city');
  const row = { ...e, country: req.headers.get('x-vercel-ip-country') || null, city: city ? decodeURIComponent(city) : null };
  const r = await getSupabaseAdmin().from('site_events').insert(row);
  return done(r.error ? 503 : 204);
}
