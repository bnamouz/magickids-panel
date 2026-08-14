import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/admin/reports/[id]/send-whatsapp
 * Sends the report PDF to the parent via WABoxApp.
 *
 * Request body:
 *   { phone?: string, message?: string }  // optional overrides
 *
 * Env required:
 *   WABOXAPP_TOKEN     — WABoxApp API token
 *   WABOXAPP_UID       — clinic WhatsApp number (972... no +)
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

    const token = process.env.WABOXAPP_TOKEN;
    const uid = process.env.WABOXAPP_UID;
    if (!token || !uid) {
      return NextResponse.json(
        { error: 'WABoxApp אינו מוגדר. חסרים משתני סביבה WABOXAPP_TOKEN/WABOXAPP_UID.' },
        { status: 500 },
      );
    }

    const supabase = getSupabaseAdmin();

    // Load report + session + patient + parent
    const { data: report, error: reportErr } = await supabase
      .from('reports')
      .select(
        'id, session_id, status, pdf_storage_path, sent_at, sent_to',
      )
      .eq('id', reportId)
      .single();

    if (reportErr || !report) {
      return NextResponse.json({ error: 'הדוח לא נמצא' }, { status: 404 });
    }

    if (!report.pdf_storage_path) {
      return NextResponse.json({ error: 'לדוח אין קובץ PDF' }, { status: 400 });
    }

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
      return NextResponse.json({ error: 'אין פרטי הורה או מספר טלפון' }, { status: 400 });
    }

    // Normalize phone: strip +, spaces, dashes. Israeli 05x → 9725x.
    const rawPhone = (phoneOverride || parent?.phone || '').trim();
    const normalized = normalizePhoneIL(rawPhone);
    if (!normalized) {
      return NextResponse.json(
        { error: `מספר טלפון לא תקין: ${rawPhone}` },
        { status: 400 },
      );
    }

    // Generate a signed URL (7 days) for the PDF so WABoxApp can download it
    const { data: signed, error: signErr } = await supabase.storage
      .from('reports')
      .createSignedUrl(report.pdf_storage_path, 60 * 60 * 24 * 7);

    if (signErr || !signed?.signedUrl) {
      return NextResponse.json(
        { error: `נכשל ביצירת קישור להורדה: ${signErr?.message || 'unknown'}` },
        { status: 500 },
      );
    }

    // Default message
    const childName = [patient.first_name, patient.last_name].filter(Boolean).join(' ') || 'ילד';
    const parentName = parent?.full_name || 'הורה';
    const defaultMessage =
      messageOverride ||
      `שלום ${parentName},\n\n` +
        `מצורף דוח אבחון קשב וריכוז עבור ${childName}.\n\n` +
        `הדוח כולל ניתוח מפורט של השאלונים, התרשמות קלינית והמלצות המשך.\n\n` +
        `לכל שאלה, אשמח לעמוד לרשותכם.\n\n` +
        `בברכה,\n` +
        `ד"ר בסים נמוז\n` +
        `מכון ילדי הקסם`;

    const customUid = `magickids-report-${reportId}-${Date.now()}`;

    // Send media (PDF) via WABoxApp
    const mediaResp = await fetch('https://www.waboxapp.com/api/send/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token,
        uid,
        to: normalized,
        custom_uid: customUid,
        url: signed.signedUrl,
        caption: `דוח אבחון - ${childName}`,
      }).toString(),
    });

    const mediaResult = await mediaResp.json().catch(() => ({}));

    if (!mediaResp.ok || !mediaResult.success) {
      return NextResponse.json(
        {
          error: `שליחת ה-PDF נכשלה: ${mediaResult?.error || `HTTP ${mediaResp.status}`}`,
          details: mediaResult,
        },
        { status: 502 },
      );
    }

    // Follow-up text message with context
    const textResp = await fetch('https://www.waboxapp.com/api/send/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token,
        uid,
        to: normalized,
        custom_uid: `${customUid}-text`,
        text: defaultMessage,
      }).toString(),
    });

    const textResult = await textResp.json().catch(() => ({}));

    // Update report status
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
      console.error('[send-whatsapp] status update failed:', updateErr);
      // Not fatal — the message was sent
    }

    // Audit log
    await supabase.from('audit_log').insert({
      actor_type: 'system',
      action: 'report_sent_whatsapp',
      entity_type: 'report',
      entity_id: reportId,
      metadata: {
        session_id: report.session_id,
        to: normalized,
        custom_uid: customUid,
        media_response: mediaResult,
        text_response: textResult,
      },
    });

    return NextResponse.json({
      ok: true,
      sent_to: normalized,
      custom_uid: customUid,
      media: mediaResult,
      text: textResult,
    });
  } catch (e: any) {
    console.error('[send-whatsapp] error:', e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}

/**
 * Normalize Israeli phone numbers to WABoxApp format:
 * - "0509955137" → "972509955137"
 * - "972509955137" → "972509955137"
 * - "+972509955137" → "972509955137"
 * - "050-995-5137" → "972509955137"
 * Returns empty string if invalid.
 */
function normalizePhoneIL(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (!digits) return '';

  // Already has country code (972 prefix, 12 digits total)
  if (digits.startsWith('972') && digits.length >= 11 && digits.length <= 13) {
    return digits;
  }

  // Israeli local format: 0XXXXXXXXX (10 digits)
  if (digits.startsWith('0') && digits.length === 10) {
    return '972' + digits.slice(1);
  }

  // Israeli without leading 0: 5XXXXXXXX (9 digits)
  if (digits.length === 9 && digits.startsWith('5')) {
    return '972' + digits;
  }

  // Fallback: return as-is if 10-13 digits (international)
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }

  return '';
}
