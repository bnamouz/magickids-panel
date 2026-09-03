import { NextRequest } from 'next/server';

/**
 * Shared bearer-token authentication for all /api/voice/* endpoints.
 *
 * The ElevenLabs agent is configured to send:
 *   Authorization: Bearer <VOICE_AGENT_TOKEN>
 *
 * Use `assertVoiceAuth(req)` at the top of every voice endpoint.
 * Returns null on success, or a Response with 401 on failure.
 */
export function assertVoiceAuth(req: NextRequest): Response | null {
  const expected = process.env.VOICE_AGENT_TOKEN;
  if (!expected) {
    // Fail closed if the env var isn't configured.
    return new Response(
      JSON.stringify({ error: 'VOICE_AGENT_TOKEN not configured on server' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  const header = req.headers.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || token !== expected) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  }
  return null;
}

/**
 * Normalise a phone number to E.164 form (+972...).
 * Accepts Israeli local formats like 054-402-0043, 0544020043, +972544020043.
 *
 * Returns null for malformed numbers (wrong length, invalid Israeli prefix).
 * This is critical: voice transcription sometimes adds/drops digits
 * (e.g. hears "05508900412" instead of "0508900412"), and we must NOT
 * silently send WhatsApp messages to non-existent numbers.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.replace(/[\s\-().]/g, '');

  // Convert to bare digits with +972 prefix
  let e164: string;
  if (s.startsWith('+')) {
    e164 = s;
  } else if (s.startsWith('00')) {
    e164 = '+' + s.slice(2);
  } else if (s.startsWith('972')) {
    e164 = '+' + s;
  } else if (s.startsWith('0')) {
    e164 = '+972' + s.slice(1);
  } else {
    e164 = '+' + s;
  }

  // Validate: Israeli numbers must be +972 followed by 9 digits total (mobile or landline)
  // Mobile: +972 5X XXXXXXX (5 followed by 8 more digits = 9 total)
  // Landline: +972 X XXXXXXX (2,3,4,8,9 area code followed by 7-8 digits)
  if (!e164.startsWith('+972')) return null;
  const digits = e164.slice(4); // digits after +972
  if (!/^\d+$/.test(digits)) return null;

  // Mobile numbers: start with 5, total 9 digits
  if (digits.startsWith('5')) {
    if (digits.length !== 9) return null;
    return e164;
  }

  // Landline: area codes 2, 3, 4, 8, 9 + 7 digits (total 8) — some accept 9 with extra digit
  if (/^[23489]/.test(digits)) {
    if (digits.length !== 8 && digits.length !== 9) return null;
    return e164;
  }

  // Special/premium: 7X — reject for now to be safe
  return null;
}
