import { google } from 'googleapis';
import { credentials, sender } from '@/lib/therapists/mail';

/** Maccabi – district children's center mailbox (owner request, 25.10.2026). */
export const MACCABI_CHILDREN_CENTER_EMAIL = 'MokedMhuziYld@mac.org.il';
export const MACCABI_ALLOWED_TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
export const MACCABI_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MACCABI_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const MACCABI_MAX_FILES = 10;

export type MailAttachment = { filename: string; contentType: string; content: Buffer };

export function maccabiSubject(o: { childName: string; nationalId?: string | null }) {
  return `מכון ילדי הקסם – ${o.childName}${o.nationalId ? ` ת.ז. ${o.nationalId}` : ''} – מסמכים לאבחון קשב וריכוז`;
}

export function maccabiBody(o: { childName: string; nationalId?: string | null; birthDate?: string | null; files: string[]; note?: string; staffName?: string | null }) {
  const lines = [
    'שלום רב,',
    '',
    `מצורפים מסמכים עבור ${o.childName}${o.nationalId ? `, ת.ז. ${o.nationalId}` : ''}${o.birthDate ? `, תאריך לידה ${o.birthDate}` : ''}.`,
    '',
    'קבצים מצורפים:',
    ...o.files.map((f, i) => `${i + 1}. ${f}`),
  ];
  if (o.note?.trim()) lines.push('', 'הערה:', o.note.trim());
  lines.push('', 'בברכה,', o.staffName ? `${o.staffName} · מכון ילדי הקסם` : 'מכון ילדי הקסם', 'ד״ר בסים נמוז · דאהר עומר אלזידאני 9, שפרעם', 'טלפון 054-402-0043 · magickids@magickidsinstitute.com');
  return lines.join('\n');
}

const b64 = (s: string) => Buffer.from(s).toString('base64');
const encodeHeader = (s: string) => Array.from(s).join('').match(/.{1,15}/gu)!.map((c) => '=?UTF-8?B?' + b64(c) + '?=').join('\r\n ');
const safeAscii = (s: string) => s.replace(/[^\x20-\x7e]/g, '_');

/** Builds the RFC 2822 message (multipart/mixed, base64 bodies) – exported for tests. */
export function buildRawMessage(o: { to: string; subject: string; text: string; attachments: MailAttachment[]; messageId: string }) {
  const boundary = `mk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const parts: string[] = [
    `From: Magic Kids <${sender}>`,
    `To: ${o.to}`,
    `Reply-To: ${sender}`,
    `Subject: ${encodeHeader(o.subject)}`,
    `Message-ID: <${o.messageId.replace(/[^a-zA-Z0-9-]/g, '-')}@magickidsinstitute.com>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(o.text).match(/.{1,76}/g)!.join('\r\n'),
  ];
  for (const a of o.attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${a.contentType}; name="${encodeHeader(a.filename)}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${safeAscii(a.filename)}"; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
      '',
      a.content.toString('base64').match(/.{1,76}/g)!.join('\r\n'),
    );
  }
  parts.push(`--${boundary}--`, '');
  return parts.join('\r\n');
}

/** Sends one plain-text email with attachments from the institute mailbox. Returns the Gmail message id. */
export async function sendMailWithAttachments(o: { to: string; subject: string; text: string; attachments: MailAttachment[]; messageId: string }) {
  const c = credentials();
  const auth = new google.auth.JWT({ email: c.client_email, key: c.private_key, scopes: ['https://www.googleapis.com/auth/gmail.send'], subject: sender });
  const raw = Buffer.from(buildRawMessage(o)).toString('base64url');
  const result = await google.gmail({ version: 'v1', auth }).users.messages.send({ userId: 'me', requestBody: { raw } }, { retry: false, timeout: 60000 });
  if (!result.data.id) throw new Error('gmail_no_id');
  return result.data.id;
}
