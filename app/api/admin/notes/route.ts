import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
const category = z.enum(['general', 'clinical', 'follow_up', 'flag']);
const createSchema = z.object({
  session_id: z.string().uuid(), id: z.string().uuid().optional(),
  content: z.string().trim().min(1).max(5000), category,
}).strict();
const changeSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('edit'), session_id: z.string().uuid(), id: z.string().uuid(),
    version: z.number().int().nonnegative(), content: z.string().trim().min(1).max(5000),
    category, reason: z.string().trim().min(3).max(1000) }).strict(),
  z.object({ action: z.literal('void'), session_id: z.string().uuid(), id: z.string().uuid(),
    version: z.number().int().nonnegative(), reason: z.string().trim().min(3).max(1000) }).strict(),
]);
const reply = (data: unknown, status = 200) => NextResponse.json(data, {
  status, headers: { 'Cache-Control': 'private, no-store' },
});
const errorMessages: Record<string, string> = {
  unauthorized: 'נדרשת התחברות מחדש.', forbidden: 'רק כותב ההערה או מנהל יכולים לשנות אותה.',
  note_changed: 'ההערה השתנתה בינתיים. רעננו את התיק לפני ניסיון נוסף.',
  note_voided: 'ההערה כבר בוטלה. ניתן לצפות בהיסטוריה בלבד.',
  note_not_found: 'ההערה לא נמצאה בתיק הזה.', case_not_found: 'התיק לא נמצא.',
};
async function mutate(req: NextRequest, change: boolean) {
  const staff = await getCurrentStaff();
  if (!staff) return reply({ error: 'נדרשת התחברות.' }, 401);
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'forbidden' }, 403);
  const parsed = (change ? changeSchema : createSchema).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply({ error: 'יש למלא תוכן תקין וסיבת שינוי של 3 תווים לפחות.' }, 400);
  const d = parsed.data;
  try {
    const { data, error } = await getSupabaseAdmin().rpc('manage_clinical_note', {
      p_staff: staff.id, p_session: d.session_id, p_note: d.id ?? randomUUID(),
      p_action: 'action' in d ? d.action : 'create',
      p_version: 'version' in d ? d.version : null,
      p_content: 'content' in d ? d.content : null,
      p_category: 'category' in d ? d.category : null,
      p_reason: 'reason' in d ? d.reason : null,
    });
    if (error) {
      const key = Object.keys(errorMessages).find(k => error.message === k);
      return reply({ error: key ? errorMessages[key] : 'השמירה אינה זמינה. אין אישור שהפעולה נשמרה; רעננו ובדקו לפני ניסיון נוסף.' },
        key === 'forbidden' || key === 'unauthorized' ? 403 : key ? 409 : 503);
    }
    return reply(data);
  } catch { return reply({ error: 'תוצאת השמירה אינה ודאית. רעננו את התיק לפני פעולה נוספת.' }, 503); }
}
export async function POST(req: NextRequest) { return mutate(req, false); }
export async function PATCH(req: NextRequest) { return mutate(req, true); }
export async function GET(req: NextRequest) {
  if (!await getCurrentStaff()) return reply({ error: 'נדרשת התחברות.' }, 401);
  const parsed = z.object({ id: z.string().uuid(), session_id: z.string().uuid() })
    .safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return reply({ error: 'בקשה לא תקינה.' }, 400);
  try {
    const db = getSupabaseAdmin();
    const note = await db.from('clinical_notes').select('id').eq('id', parsed.data.id)
      .eq('session_id', parsed.data.session_id).maybeSingle();
    if (note.error) return reply({ error: 'ההיסטוריה אינה זמינה.' }, 503);
    if (!note.data) return reply({ error: 'ההערה לא נמצאה בתיק הזה.' }, 404);
    const result = await db.from('clinical_note_revisions')
      .select('id,version,category,content,changed_by,changed_at,action,reason,staff_users:users(full_name)')
      .eq('note_id', parsed.data.id).order('version', { ascending: false });
    if (result.error) return reply({ error: 'ההיסטוריה אינה זמינה.' }, 503);
    return reply({ revisions: result.data ?? [] });
  } catch { return reply({ error: 'ההיסטוריה אינה זמינה.' }, 503); }
}
