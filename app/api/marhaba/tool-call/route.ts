// app/api/marhaba/tool-call/route.ts
// Marhaba Sales — 5 tools for Nour when in sales mode.
// ElevenLabs calls this endpoint for every tool. tool_name in body picks the handler.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendWhatsAppText } from '@/lib/whatsapp-ultramsg';
import { normalizeIsraeliPhone } from '@/lib/marhaba/phone';
import { getUpcomingDemoSlots, formatHebrewDatetime, buildDemoIso } from '@/lib/marhaba/calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASEEM_PHONE = process.env.BASEEM_PHONE || '+972509955137';
const DEMO_VIDEO_URL = process.env.MARHABA_DEMO_VIDEO_URL || 'https://marhaba.co.il/demo.mp4';

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const tool = body?.tool_name || body?.name;
  const params = body?.parameters || body?.arguments || body?.args || {};
  const conversationId = body?.conversation_id || null;

  try {
    switch (tool) {
      case 'check_demo_slots':
        return NextResponse.json({ result: await checkDemoSlots() });
      case 'book_marhaba_demo':
        return NextResponse.json({ result: await bookMarhabaDemo(params, conversationId) });
      case 'send_marhaba_video':
        return NextResponse.json({ result: await sendMarhabaVideo(params) });
      case 'mark_lead_not_interested':
        return NextResponse.json({ result: await markNotInterested(params) });
      case 'escalate_to_baseem':
        return NextResponse.json({ result: await escalateToBaseem(params, conversationId) });
      default:
        return NextResponse.json({ error: `unknown_tool: ${tool}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error(`[marhaba/tool-call] ${tool} failed`, err);
    return NextResponse.json(
      { error: 'tool_execution_failed', details: err?.message || String(err) },
      { status: 500 },
    );
  }
}

// ============================================================
// Tool: check_demo_slots
// ============================================================
async function checkDemoSlots() {
  const slots = getUpcomingDemoSlots(7);
  return {
    available_slots: slots.slice(0, 8), // first 8 to keep voice response manageable
    speak_message: slots.length
      ? `יש לי ${slots.length} אפשרויות פנויות. הראשונות: ${slots.slice(0, 3).map(s => s.hebrew_label).join('; ')}. מה מהם הכי נוח?`
      : 'כרגע אין slots פנויים, בואו נקבע callback.',
  };
}

// ============================================================
// Tool: book_marhaba_demo
// ============================================================
async function bookMarhabaDemo(params: any, conversationId: string | null) {
  const { contact_name, contact_phone, clinic_name, demo_date, demo_time, type = 'demo', notes } = params;
  if (!contact_phone || !demo_date || !demo_time) {
    return { success: false, error: 'missing required fields: contact_phone, demo_date, demo_time' };
  }

  const phone = normalizeIsraeliPhone(contact_phone);
  const scheduledIso = buildDemoIso(demo_date, demo_time);
  const supabase = getSupabaseAdmin();

  // Upsert lead
  const { data: existingLead } = await supabase
    .from('marhaba_leads')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  let leadId = existingLead?.id;
  if (!leadId) {
    const { data: newLead, error: leadErr } = await supabase
      .from('marhaba_leads')
      .insert({
        clinic_name: clinic_name || 'לא ידוע',
        phone,
        contact_name: contact_name || null,
        status: 'demo_booked',
        source: 'nour_call',
        fit_score: 8,
        interest_level: 'hot',
        notes: notes || null,
      })
      .select('id')
      .single();
    if (leadErr) throw leadErr;
    leadId = newLead.id;
  } else {
    await supabase
      .from('marhaba_leads')
      .update({
        status: 'demo_booked',
        interest_level: 'hot',
        contact_name: contact_name || undefined,
        clinic_name: clinic_name || undefined,
        last_call_at: new Date().toISOString(),
      })
      .eq('id', leadId);
  }

  // Insert demo
  const { error: demoErr } = await supabase.from('marhaba_demos').insert({
    lead_id: leadId,
    scheduled_at: scheduledIso,
    type,
    status: 'scheduled',
    conversation_id: conversationId,
    notes: notes || null,
  });
  if (demoErr) throw demoErr;

  // WhatsApp to lead
  const humanTime = formatHebrewDatetime(scheduledIso);
  const leadMessage = type === 'demo'
    ? `שלום ${contact_name || ''} 👋\n\nהדמו של Marhaba נקבע ל-${humanTime}.\nד"ר בסים ישלח קישור לזום 10 דקות לפני.\n\nלביטול/דחייה: ענה להודעה הזאת.`
    : `שלום ${contact_name || ''} 👋\n\nקבענו שיחה חוזרת ל-${humanTime}. אתקשר אליך אז.\n— נור, Marhaba`;
  await sendWhatsAppText({ toPhone: phone, body: leadMessage });

  // Alert Baseem
  await sendWhatsAppText({
    toPhone: BASEEM_PHONE,
    body: `🔥 דמו חדש נקבע!\n\nמרפאה: ${clinic_name}\nאיש קשר: ${contact_name}\nטלפון: ${phone}\nמועד: ${humanTime}\nסוג: ${type}`,
  });

  return {
    success: true,
    lead_id: leadId,
    scheduled_at: scheduledIso,
    speak_message: `מעולה, קבעתי לך ${type === 'demo' ? 'דמו' : 'שיחה חוזרת'} ל-${humanTime}. שלחתי לך אישור בוואטסאפ.`,
  };
}

// ============================================================
// Tool: send_marhaba_video
// ============================================================
async function sendMarhabaVideo(params: any) {
  const { contact_phone, contact_name, custom_message } = params;
  if (!contact_phone) return { success: false, error: 'contact_phone required' };

  const phone = normalizeIsraeliPhone(contact_phone);
  const supabase = getSupabaseAdmin();

  const message = custom_message ||
    `שלום ${contact_name || ''} 👋\n\nכפי שהובטח, הנה סרטון של דקה שמסביר בדיוק איך Marhaba עובדת:\n${DEMO_VIDEO_URL}\n\nיש לך שאלות? ענה להודעה הזאת ואחזור אליך.\n— נור, Marhaba`;

  const result = await sendWhatsAppText({ toPhone: phone, body: message });

  // Update lead status
  await supabase
    .from('marhaba_leads')
    .update({
      status: 'video_sent',
      last_call_at: new Date().toISOString(),
      next_action_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // follow-up in 3 days
    })
    .eq('phone', phone);

  return {
    success: result.ok,
    message_id: result.id,
    speak_message: 'מעולה, שלחתי לך עכשיו את הסרטון בוואטסאפ. תסתכל בזמן שנוח לך, ואחזור אליך בעוד כמה ימים.',
  };
}

// ============================================================
// Tool: mark_lead_not_interested
// ============================================================
async function markNotInterested(params: any) {
  const { contact_phone, reason = 'other' } = params;
  if (!contact_phone) return { success: false, error: 'contact_phone required' };

  const phone = normalizeIsraeliPhone(contact_phone);
  const supabase = getSupabaseAdmin();

  await supabase
    .from('marhaba_leads')
    .update({
      status: 'not_interested',
      interest_level: 'cold',
      notes: `not_interested: ${reason}`,
      last_call_at: new Date().toISOString(),
      // Follow-up in 90 days
      next_action_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq('phone', phone);

  return {
    success: true,
    speak_message: 'בסדר, תודה על הזמן שלך. יום נעים.',
  };
}

// ============================================================
// Tool: escalate_to_baseem
// ============================================================
async function escalateToBaseem(params: any, conversationId: string | null) {
  const { contact_name, contact_phone, clinic_name, reason } = params;
  if (!contact_phone) return { success: false, error: 'contact_phone required' };

  const phone = normalizeIsraeliPhone(contact_phone);
  const supabase = getSupabaseAdmin();

  await supabase
    .from('marhaba_leads')
    .update({
      status: 'escalated',
      interest_level: 'hot',
      notes: `escalated: ${reason}`,
      last_call_at: new Date().toISOString(),
    })
    .eq('phone', phone);

  await sendWhatsAppText({
    toPhone: BASEEM_PHONE,
    body: `⚠️ Escalation מנור-סיילס!\n\nמרפאה: ${clinic_name}\nאיש קשר: ${contact_name}\nטלפון: ${phone}\nסיבה: ${reason}\n\nConv ID: ${conversationId || 'n/a'}\nחייג אליו תוך שעתיים.`,
  });

  return {
    success: true,
    speak_message: 'מצוין. ד"ר בסים יתקשר אליך אישית תוך שעתיים. תודה על הזמן.',
  };
}
