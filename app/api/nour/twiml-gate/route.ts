import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { normalisePhone } from '@/lib/nour-auth';

/**
 * POST /api/nour/twiml-gate
 *
 * Called by Twilio when a call arrives at Nour's number.
 * Checks VIP list — if caller is VIP, <Reject> to let the original
 * partner cellular network keep ringing the user's phone.
 * Otherwise <Redirect> to ElevenLabs Conversational AI SIP endpoint.
 *
 * Twilio sends form-encoded data with 'From', 'To', 'CallSid', etc.
 */
export const runtime = 'nodejs';

const XML_HEADERS = { 'Content-Type': 'text/xml; charset=utf-8' };

async function isVip(phone: string): Promise<{ vip: boolean; name?: string }> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('nour_vip_list')
    .select('name')
    .eq('phone_e164', phone)
    .maybeSingle();
  return { vip: !!data, name: data?.name };
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const from = form.get('From')?.toString() || '';
  const normalisedFrom = normalisePhone(from) || from;

  console.log(`[nour/twiml-gate] incoming call from ${from} (normalised: ${normalisedFrom})`);

  const { vip, name } = await isVip(normalisedFrom);

  if (vip) {
    console.log(`[nour/twiml-gate] VIP caller ${name || normalisedFrom} — rejecting`);
    // <Reject> with busy signal → caller hears busy → partner network
    // times out on Nour and rings user's phone normally
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="busy"/></Response>`,
      { headers: XML_HEADERS },
    );
  }

  // Non-VIP: hand off to ElevenLabs Conversational AI
  // The ElevenLabs phone number binding already routes inbound calls through
  // their platform. We use <Dial><Sip> if we want to manually forward, but
  // since the number is bound to the ElevenLabs agent, this endpoint is
  // only used for the VIP gate. On non-VIP, Twilio will fall through to
  // the phone number's default routing (ElevenLabs) — but that requires
  // this endpoint NOT to be the primary handler.
  //
  // Instead, we <Redirect> to ElevenLabs' incoming call handler URL.
  const agentId = process.env.NOUR_ELEVENLABS_AGENT_ID;
  if (!agentId) {
    console.error('[nour/twiml-gate] NOUR_ELEVENLABS_AGENT_ID not set — hanging up');
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Configuration error. Please try again later.</Say><Hangup/></Response>`,
      { headers: XML_HEADERS },
    );
  }

  // ElevenLabs Twilio integration webhook URL
  const elevenlabsWebhook = `https://api.us.elevenlabs.io/twilio/inbound_call?agent_id=${agentId}`;
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${elevenlabsWebhook}</Redirect></Response>`,
    { headers: XML_HEADERS },
  );
}
