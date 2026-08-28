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
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) return s;
  if (s.startsWith('00')) return '+' + s.slice(2);
  if (s.startsWith('972')) return '+' + s;
  if (s.startsWith('0')) return '+972' + s.slice(1);
  return '+' + s;
}
