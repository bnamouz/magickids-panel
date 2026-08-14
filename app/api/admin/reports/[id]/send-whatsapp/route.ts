import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/admin/reports/[id]/send-whatsapp
 *
 * Prepares a WhatsApp handoff for a report:
 *  1. Creates a 7-day signed URL for the PDF in Supabase Storage.
 *  2. Builds a wa.me deep link pre-filled with a Hebrew message + link.
 *  3. Marks the report as sent (status='sent', sent_at=now, sent_to=phone).
 *  4. Writes an audit_log entry.
 *
 * Returns:
 *   {
 *     ok: true,
 *     wa_link:  "https://wa.me/972509955137?text=...",
 *     download_url: "<signed pdf url>",
 *     message: "<default Hebrew message>",
 *     phone: "972509955137"
 *   }
 *
 * The client (browser) opens wa_link in a new tab — user reviews & sends manually.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: reportId } = await params;
    const body = await req.json().catch(() => ({}));
    const phoneOverride: string | undefined = body?.phone;
    const messageOverride: string | undefined = body?.message;

    const supabase = getSupabaseAdmin();

    // Load report
    const { data: report, error: reportErr } = await supabase
      .from('reports')
      .select('id, session_id, status, pdf_storage_path')
      .eq('id', reportId)
      .single();

    if (reportErr || !report) {
      return NextResponse.json({ error: 'הדוח לא נמצא' }, { status: 404 });
    }

    if (!report.pdf_storage_path) {
      return NextResponse.json({ error: 'לדוח אין קובץ PDF' }, { status: 400 });
    }

    // Load session with patient + primary parent
    const { data: session, error: sessErr } = await supabase
      .from('intake_sessions')
      .select(
        `id,
         patients ( first_name, last_name, birth_date ),
         parents!intake_sessions_primary_parent_id_fkey ( full_name, phone )`,
      )
      .eq('id', report.session_id)
      .single();

    if (sessErr || !session) {
      return NextResponse.json({ error: 'התיק לא נמצא' }, { status: 404 });
    }

    const patients = Array.isArray((session as any).patients)
      ? (session as any).patients
      : [(session as any).patients];
    const parents = Array.isArray((session as any).parents)
      ? (session as any).parents
      : [(session as any).parents];
    const patient = patients[0];
    const parent = parents[0];

    if (!patient) {
      return NextResponse.json({ error: 'אין פרטי ילד' }, { status: 400 });
    }
    if (!parent && !phoneOverride) {
      return NextResponse.json(
        { error: 'אין פרטי הורה או מספר טלפון' },
        { status: 400 },
      );
    }

    const rawPhone = (phoneOverride || parent?.phone || '').trim();
    const normalized = normalizePhoneIL(rawPhone);
    if (!normalized) {
      return NextResponse.json(
        { error: `מספר טלפון לא תקין: ${rawPhone}` },
        { status: 400 },
      );
    }

    // Generate signed URL (7 days)
    const { data: signed, error: signErr } = await supabase.storage
      .from('reports')
      .createSignedUrl(report.pdf_storage_path, 60 * 60 * 24 * 7);

    if (signErr || !signed?.signedUrl) {
      return NextResponse.json(
        { error: `נכשל ביצירת קישור הורדה: ${signErr?.message || 'unknown'}` },
        { status: 500 },
      );
    }

    // Build default message
    const childName =
      [patient.first_name, patient.last_name].filter(Boolean).join(' ') || 'ילד';
    const parentName = parent?.full_name || 'הורה יקר';

    const defaultMessage =
      messageOverride ||
      `שלום ${parentName},\n\n` +
        `מצורף דוח אבחון קשב וריכוז עבור ${childName}.\n\n` +
        `הדוח כולל ניתוח מפורט של השאלונים, התרשמות קלינית והמלצות המשך.\n\n` +
        `לינק להורדת ה-PDF (בתוקף ל-7 ימים):\n${signed.signedUrl}\n\n` +
        `לכל שאלה, אשמח לעמוד לרשותכם.\n\n` +
        `בברכה,\n` +
        `ד"ר בסים נמוז\n` +
        `מכון ילדי הקסם`;

    // Build wa.me deep link — text is URL-encoded
    const waLink = `https://wa.me/${normalized}?text=${encodeURIComponent(defaultMessage)}`;

    // Update report status to 'sent'
    const nowIso = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('reports')
      .update({
        status: 'sent',
        sent_at: nowIso,
        sent_to: `whatsapp:${normalized}`,
      })
      .eq('id', reportId);

    if (updateErr) {
      console.error('[whatsapp-link] status update failed:', updateErr);
    }

    // Audit log
    await supabase.from('audit_log').insert({
      actor_type: 'system',
      action: 'report_whatsapp_link_generated',
      entity_type: 'report',
      entity_id: reportId,
      metadata: {
        session_id: report.session_id,
        phone: normalized,
        parent_name: parentName,
        child_name: childName,
      },
    });

    return NextResponse.json({
      ok: true,
      wa_link: waLink,
      download_url: signed.signedUrl,
      message: defaultMessage,
      phone: normalized,
      parent_name: parentName,
      child_name: childName,
    });
  } catch (e: any) {
    console.error('[whatsapp-link] error:', e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}

function normalizePhoneIL(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('972') && digits.length >= 11 && digits.length <= 13) {
    return digits;
  }
  if (digits.startsWith('0') && digits.length === 10) {
    return '972' + digits.slice(1);
  }
  if (digits.length === 9 && digits.startsWith('5')) {
    return '972' + digits;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }
  return '';
}
