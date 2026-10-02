import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
const schema = z.object({ sessionId: z.string().uuid(), kind: z.enum(['parent', 'teacher']) });
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return json({ error: 'בקשה לא מורשית' }, 403);
  const staff = await getCurrentStaff();
  if (!staff) return json({ error: 'נדרשת כניסת צוות' }, 401);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'בקשה לא תקינה' }, 400);
  const { sessionId, kind } = parsed.data;
  const db = getSupabaseAdmin();
  const { data: session, error } = await db.from('intake_sessions').select('id,status,parent_token,teacher_token,parent_token_expires_at,teacher_token_expires_at').eq('id', sessionId).maybeSingle();
  if (error) return json({ error: 'לא ניתן לטעון את התיק' }, 500);
  if (!session) return json({ error: 'התיק לא נמצא' }, 404);
  const field = kind === 'parent' ? 'parent_token' : 'teacher_token';
  const expiry = kind === 'parent' ? 'parent_token_expires_at' : 'teacher_token_expires_at';
  let token = session[field];
  let expiresAt = session[expiry];
  if (!token || (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()))) {
    const nextToken = token || randomUUID();
    const nextExpiry = new Date(Date.now() + 30 * 86400000).toISOString();
    let query = db.from('intake_sessions').update({ [field]: nextToken, [expiry]: nextExpiry }).eq('id', sessionId).eq('status', session.status);
    query = token ? query.eq(field, token) : query.is(field, null);
    const { data: updated, error: updateError } = await query.select('id').maybeSingle();
    if (updateError || !updated) return json({ error: 'לא ניתן לעדכן את הקישור. רעננו ונסו שוב.' }, 409);
    token = nextToken;
    expiresAt = nextExpiry;
    await db.from('audit_log').insert({ session_id: sessionId, actor: `staff:${staff.email}`, action: 'questionnaire_link_restored', payload: { kind } });
  }
  return json({ token, expiresAt });
}
