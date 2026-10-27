import { google } from 'googleapis';
import { credentials, sender } from '@/lib/therapists/mail';

const SEND = 'https://www.googleapis.com/auth/gmail.send';
const READ = 'https://www.googleapis.com/auth/gmail.readonly';

function client(scopes: string[]) {
  const c = credentials();
  const auth = new google.auth.JWT({ email: c.client_email, key: c.private_key, scopes, subject: sender });
  return google.gmail({ version: 'v1', auth });
}

/** Service-account identity shown to the owner when Workspace delegation must be extended (never the key). */
export function delegationInfo() {
  try { const c = credentials(); return { client_email: c.client_email as string, client_id: (c.client_id as string | undefined) ?? null }; } catch { return null; }
}

export async function sendRaw(raw: string, threadId?: string | null) {
  const r = await client([SEND]).users.messages.send({ userId: 'me', requestBody: { raw: Buffer.from(raw).toString('base64url'), ...(threadId ? { threadId } : {}) } }, { retry: false, timeout: 60000 });
  return { id: r.data.id ?? null, threadId: r.data.threadId ?? null };
}

/** Confirms the delegated account can read mail. 'unauthorized' means the gmail.readonly scope is missing in Workspace Admin. */
export async function readAccess(): Promise<'ok' | 'unauthorized' | 'not_configured' | 'error'> {
  try { await client([READ]).users.labels.get({ userId: 'me', id: 'INBOX' }, { retry: false, timeout: 15000 }); return 'ok'; }
  catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/not_configured/.test(m)) return 'not_configured';
    if (/unauthorized_client|insufficient|403|401|invalid_grant|access_denied|Insufficient Permission/i.test(m)) return 'unauthorized';
    return 'error';
  }
}

export type ThreadMessage = { id: string; from: string; date: Date; subject: string; text: string; isOurs: boolean };

const decode = (b64?: string | null) => (b64 ? Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') : '');
function bodyText(part: any): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return decode(part.body.data);
  if (part.mimeType === 'text/html' && part.body?.data) return decode(part.body.data).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  if (Array.isArray(part.parts)) { const plain = part.parts.find((p: any) => p.mimeType === 'text/plain'); return bodyText(plain) || part.parts.map(bodyText).join('\n'); }
  return '';
}

export async function threadMessages(threadId: string): Promise<ThreadMessage[]> {
  const r = await client([READ]).users.threads.get({ userId: 'me', id: threadId, format: 'full' }, { retry: false, timeout: 30000 });
  const own = sender.toLowerCase();
  return (r.data.messages ?? []).map((m) => {
    const h = (name: string) => m.payload?.headers?.find((x) => x.name?.toLowerCase() === name)?.value ?? '';
    const from = h('from');
    return { id: m.id!, from, date: new Date(Number(m.internalDate ?? Date.now())), subject: h('subject'), text: bodyText(m.payload).trim(), isOurs: from.toLowerCase().includes(own) };
  });
}
