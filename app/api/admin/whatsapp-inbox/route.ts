import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

/** Staff actions on the institute WhatsApp inbox. Never sends WhatsApp messages. */
const schema = z.object({
  chat_phone: z.string().regex(/^[0-9]{6,20}$/),
  action: z.enum(['pause', 'resume', 'handled']),
  hours: z.number().int().min(1).max(24 * 30).optional(),
}).strict();

export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const { chat_phone, action, hours } = parsed.data;
  const now = new Date();
  const update = action === 'pause'
    ? { paused_until: new Date(now.getTime() + (hours ?? 24 * 7) * 3600_000).toISOString(), paused_reason: 'manual' }
    : action === 'resume'
      ? { paused_until: null, paused_reason: null }
      : { needs_staff: false, handled_at: now.toISOString(), handled_by: staff.id };
  const r = await getSupabaseAdmin().from('institute_wa_chats').update({ ...update, updated_at: now.toISOString() }).eq('chat_phone', chat_phone).select('chat_phone').maybeSingle();
  if (r.error) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  if (!r.data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
