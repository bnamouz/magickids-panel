import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStaff } from '@/lib/admin/auth';

/**
 * POST /api/nour/outbound-call
 *
 * Initiates an outbound call via ElevenLabs Twilio integration.
 * Nour (personal secretary agent) calls the specified number.
 *
 * Body: { to_number: string, purpose?: string, patient_name?: string }
 */
export const runtime = 'nodejs';

const NOUR_AGENT_ID = 'agent_7401m15cmgy9e38866m3tq30r3vr';
const NOUR_PHONE_ID = 'phnum_0801m15ct561fjsvtv8xrnddnkt5';

function normalizePhone(raw: string): string {
  let cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '+972' + cleaned.slice(1);
  } else if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  return cleaned;
}

export async function POST(req: NextRequest) {
  // Auth: require logged-in staff
  const staff = await getCurrentStaff();
  if (!staff) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  const rawPhone = body?.to_number;
  if (!rawPhone || typeof rawPhone !== 'string') {
    return NextResponse.json({ success: false, error: 'to_number required' }, { status: 400 });
  }

  const toNumber = normalizePhone(rawPhone);
  const purpose = body?.purpose || 'call from Dr. Baseem\'s office';
  const patientName = body?.patient_name || null;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'missing_api_key' }, { status: 500 });
  }

  // Detect if patient name is Hebrew (contains Hebrew chars) to pick language
  const isHebrew = patientName && /[֐-׿]/.test(patientName);

  // Build the opening line that Nour will say IMMEDIATELY when the call connects.
  // This overrides her default inbound greeting.
  const displayName = patientName || (isHebrew ? 'מדבר/ת' : 'حضرتك');

  const openingLine = isHebrew
    ? `שלום, מדברת נור מהמרפאה של דוקטור בסים נמוז. אני מדברת עם ${displayName}? דוקטור בסים ביקש ממני להתקשר אלייך בנוגע ל: ${purpose}`
    : `مرحبا، معك نور من عيادة الدكتور بَسيم نموز. بحكي مع ${displayName}؟ الدكتور بَسيم طلب منّي أتصل فيك بخصوص: ${purpose}`;

  // Build dynamic variables to pass into Nour's system prompt for this call
  const dynamicVariables: Record<string, string> = {
    call_purpose: purpose,
    patient_name: patientName || '',
    opening_line: openingLine,
  };

  const payload = {
    agent_id: NOUR_AGENT_ID,
    agent_phone_number_id: NOUR_PHONE_ID,
    to_number: toNumber,
    conversation_initiation_client_data: {
      dynamic_variables: dynamicVariables,
    },
  };

  try {
    const resp = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error('[nour/outbound-call] ElevenLabs error', data);
      return NextResponse.json(
        { success: false, error: 'elevenlabs_error', details: data },
        { status: resp.status },
      );
    }

    return NextResponse.json({
      success: true,
      to_number: toNumber,
      conversation_id: data.conversation_id,
      call_sid: data.callSid || data.call_sid,
      message: `נור מתקשרת אל ${toNumber}`,
    });
  } catch (err) {
    console.error('[nour/outbound-call] fetch failed', err);
    return NextResponse.json(
      { success: false, error: 'fetch_failed', details: String(err) },
      { status: 500 },
    );
  }
}
