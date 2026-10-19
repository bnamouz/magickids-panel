import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { sendQuestionnaireReminder } from '@/lib/intake/reminder';

export const dynamic = 'force-dynamic';
const schema = z.object({ sessionId: z.string().uuid(), kind: z.enum(['parent', 'teacher']), language: z.enum(['he', 'ar']).default('he'), force: z.boolean().default(false) }).strict();
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

/** Staff-triggered WhatsApp reminder (institute number) to complete the parent or teacher questionnaire, with the resume link. */
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return json({ error: 'בקשה לא מורשית' }, 403);
  const staff = await getCurrentStaff();
  if (!staff) return json({ error: 'נדרשת כניסת צוות' }, 401);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'בקשה לא תקינה' }, 400);
  const result = await sendQuestionnaireReminder({ ...parsed.data, lang: parsed.data.language, staffId: staff.id });
  const code = result.status === 'sent' || result.status === 'recent' ? 200 : result.status === 'not_found' ? 404 : result.status === 'unavailable' ? 503 : result.status === 'failed' || result.status === 'unknown' ? 502 : 409;
  return json(result, code);
}
