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

  // Nour ALWAYS speaks Arabic. If patient name or purpose contains Hebrew,
  // we transliterate it to Arabic script so she pronounces it correctly.
  // (Hebrew letters would be read as Hebrew by the multilingual model.)
  const hasHebrew = (s: string) => /[֐-׿]/.test(s);

  async function transliterateHebrewToArabic(text: string): Promise<string> {
    if (!text || !hasHebrew(text)) return text;
    try {
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) return text;
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: [
                'You are a strict transliteration engine for an Arabic TTS voice.',
                '',
                'RULES:',
                '1. Convert EVERY Hebrew letter to Arabic script based on its SOUND (not meaning).',
                '2. NO Hebrew characters may remain in the output. Zero. Not one letter.',
                '3. Preserve Arabic text unchanged.',
                '4. Keep numbers and punctuation as-is.',
                '5. Output ONLY the transliterated text, nothing else.',
                '',
                'Hebrew-to-Arabic sound mapping:',
                'א=ا, ב=ب, ג=ج, ד=د, ה=ه, ו=و, ז=ز, ח=ح, ט=ط, י=ي, כ=ك, ך=ك, ל=ل, מ=م, ם=م, נ=ن, ן=ن, ס=س, ע=ع, פ=ف, ף=ف, צ=ص, ץ=ص, ק=ق, ר=ر, ש=ش, ת=ت',
                '',
                'Examples:',
                '"בדיקות הדם תקינות" → "بديقوت هدم تقينوت"',
                '"בסים נמוז" → "بسيم نموز"',
                '"שלום" → "شلوم"'
              ].join('\n'),
            },
            {
              role: 'user',
              content: text,
            },
          ],
          temperature: 0,
        }),
      });
      const j: any = await resp.json();
      const out = j?.choices?.[0]?.message?.content?.trim();
      return out || text;
    } catch {
      return text;
    }
  }

  // Transliterate name + purpose if needed (parallel)
  const [displayName, purposeArabic] = await Promise.all([
    transliterateHebrewToArabic(patientName || 'حضرتك'),
    transliterateHebrewToArabic(purpose),
  ]);

  // Always Arabic opening — Nour is Arabic-speaking
  const openingLine = `مرحبا، معك نور من عيادة الدكتور بَسيم نموز. بحكي مع ${displayName}؟ الدكتور بَسيم طلب منّي أتصل فيك بخصوص: ${purposeArabic}`;

  // Build dynamic variables to pass into Nour's system prompt for this call
  const dynamicVariables: Record<string, string> = {
    call_purpose: purposeArabic,
    patient_name: displayName,
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
