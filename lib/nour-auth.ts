import { NextRequest, NextResponse } from 'next/server';

/**
 * Nour endpoints share the same VOICE_AGENT_TOKEN as Sarah since both are
 * called from ElevenLabs Conversational AI with the same Bearer token.
 */
export function assertNourAuth(req: NextRequest): NextResponse | null {
  const auth = req.headers.get('authorization');
  const expected = process.env.VOICE_AGENT_TOKEN;
  if (!expected) {
    return NextResponse.json({ success: false, error: 'server_misconfigured' }, { status: 500 });
  }
  if (!auth || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

export function normalisePhone(input: string): string | null {
  if (!input) return null;
  let s = input.trim().replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('0')) s = '+972' + s.slice(1);
  if (!s.startsWith('+')) s = '+' + s;
  if (!/^\+\d{7,15}$/.test(s)) return null;
  return s;
}
