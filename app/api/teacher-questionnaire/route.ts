import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';

const generateSchema = z.object({
  parent_token: z.string().min(1),
  teacher_name: z.string().optional(),
  teacher_email: z.string().email().optional(),
  teacher_phone: z.string().optional(),
});

/**
 * POST /api/teacher-questionnaire
 *
 * Called by the parent (after they complete their form) to generate a
 * teacher link. The parent shares this link with the teacher via
 * WhatsApp/Email. Teacher submissions go directly back to the system,
 * NOT through the parent.
 *
 * Returns the teacher URL + a sharing snippet (Hebrew).
 */
function getAppUrl(req: NextRequest): string {
  // Prefer env var, but fall back to the request origin so links never break.
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && envUrl.startsWith('http')) return envUrl.replace(/\/$/, '');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (host) return `${proto}://${host}`;
  return 'https://magickids-panel.vercel.app';
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const { parent_token, teacher_name, teacher_email, teacher_phone } = parsed.data;
  const appUrlBase = getAppUrl(req);

  if (parent_token === 'demo') {
    const demoUrl = `${appUrlBase}/teacher/demo`;
    return NextResponse.json({
      ok: true,
      demo: true,
      teacher_token: 'demo',
      teacher_url: demoUrl,
      share_message: buildShareMessage(demoUrl, 'ילד לדוגמא'),
      whatsapp_url: buildWhatsAppUrl(demoUrl, 'ילד לדוגמא'),
    });
  }

  const supabase = getSupabaseAdmin();

  // Lookup session by parent_token
  const { data: session, error } = await supabase
    .from('intake_sessions')
    .select('id, status, teacher_token, patients(first_name, last_name)')
    .eq('parent_token', parent_token)
    .maybeSingle();

  if (error || !session) {
    return NextResponse.json({ error: 'invalid parent token' }, { status: 404 });
  }

  // Must have submitted parent form first
  if (!['parent_form_done', 'teacher_form_started', 'teacher_form_done', 'profile_ready'].includes(session.status)) {
    return NextResponse.json(
      { error: 'parent form not yet submitted', status: session.status },
      { status: 400 },
    );
  }

  // Generate teacher token via SQL helper (if not already created)
  let teacherToken = session.teacher_token as string | null;

  if (!teacherToken) {
    const { data: tokenRow, error: rpcError } = await supabase.rpc('generate_teacher_link', {
      p_session_id: session.id,
      p_teacher_name: teacher_name ?? null,
      p_teacher_email: teacher_email ?? null,
      p_teacher_phone: teacher_phone ?? null,
    });
    if (rpcError) {
      return NextResponse.json({ error: 'failed to generate token', details: rpcError.message }, { status: 500 });
    }
    teacherToken = tokenRow as string;
  } else if (teacher_name || teacher_email || teacher_phone) {
    // Update teacher contact info if provided
    await supabase
      .from('intake_sessions')
      .update({
        teacher_name: teacher_name ?? null,
        teacher_email: teacher_email ?? null,
        teacher_phone: teacher_phone ?? null,
      })
      .eq('id', session.id);
  }

  const teacherUrl = `${appUrlBase}/teacher/${teacherToken}`;

  const patient = (session as any).patients;
  const childName = `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim();

  // Update status
  if (session.status === 'parent_form_done') {
    await supabase.from('intake_sessions').update({ status: 'teacher_link_sent' }).eq('id', session.id);
  }

  // Audit
  await supabase.from('audit_log').insert({
    session_id: session.id,
    actor: 'parent',
    action: 'teacher_link_sent',
    payload: { teacher_name, teacher_email, teacher_phone },
  });

  return NextResponse.json({
    ok: true,
    teacher_token: teacherToken,
    teacher_url: teacherUrl,
    share_message: buildShareMessage(teacherUrl, childName),
    whatsapp_url: buildWhatsAppUrl(teacherUrl, childName, teacher_phone),
  });
}

function buildShareMessage(url: string, childName: string): string {
  return `שלום, אני הורה של ${childName}.
אנחנו בתהליך אבחון ב"מכון ילדי הקסם" ונשמח אם תוכל/י למלא שאלון קצר (כ-10 דקות) על התנהגות הילד/ה בכיתה.

הקישור: ${url}

תודה רבה! 🙏
(התשובות נשלחות ישירות למכון ולא חוזרות אליי – לשמירה על אובייקטיביות)`;
}

function buildWhatsAppUrl(url: string, childName: string, phone?: string): string {
  const text = encodeURIComponent(buildShareMessage(url, childName));
  if (phone) {
    const clean = phone.replace(/[^\d]/g, '');
    return `https://wa.me/${clean}?text=${text}`;
  }
  return `https://wa.me/?text=${text}`;
}
