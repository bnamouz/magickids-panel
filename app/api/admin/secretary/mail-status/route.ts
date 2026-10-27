import { NextRequest } from 'next/server';
import { mailConfigured } from '@/lib/therapists/mail';
import { delegationInfo, readAccess } from '@/lib/maccabi/gmail';
import { guard, reply } from '../_guard';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Tells the desk whether the secretary can send mail and read Maccabi's replies (needs gmail.readonly in Workspace delegation). */
export async function GET(req: NextRequest) {
  const g = await guard(req); if ('error' in g) return g.error;
  const send = mailConfigured();
  const read = send ? await readAccess() : 'not_configured';
  const info = delegationInfo();
  return reply({ send, read, client_id: info?.client_id ?? null, client_email: info?.client_email ?? null });
}
