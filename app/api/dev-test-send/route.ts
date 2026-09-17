// TEMPORARY test endpoint — REMOVE after verification
// Guarded by a long random token stored server-side.
import { mailReady, sendPacket } from '@/lib/development/mail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const REQUIRED_TOKEN = 'cJqShv5me8DmADaVwCoZuKn0c5uv99hFBIdB3GPyh2n2-J-rEJ6GE-N78AcsyV23';

export async function POST(req: Request) {
  const token = req.headers.get('x-test-token') || '';
  if (token.length < 40 || token !== REQUIRED_TOKEN) {
    return new Response('forbidden', { status: 403 });
  }
  if (!mailReady()) {
    return Response.json({ ok: false, error: 'MAIL_NOT_CONFIGURED' }, { status: 500 });
  }
  try {
    // Minimal PDF: 4 attachments, all base64 of same tiny PDF
    const tinyPdfBase64 = 'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNjEyIDc5Ml0+PmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYKMDAwMDAwMDAwOSAwMDAwMCBuCjAwMDAwMDAwNTIgMDAwMDAgbgowMDAwMDAwMDk1IDAwMDAwIG4KdHJhaWxlcjw8L1NpemUgNC9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjE1NAolJUVPRg==';
    const attachments = [
      { filename: 'parent_original.pdf', content: tinyPdfBase64 },
      { filename: 'education_original.pdf', content: tinyPdfBase64 },
      { filename: 'referral.pdf', content: tinyPdfBase64 },
      { filename: 'consent.pdf', content: tinyPdfBase64 },
    ];
    // Use a valid UUID for Message-ID
    const testId = '00000000-0000-0000-0000-000000000001';
    const emailId = await sendPacket(testId, attachments);
    return Response.json({ ok: true, email_id: emailId });
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message || String(e), stack: (e.stack || '').split('\n').slice(0, 5) }, { status: 500 });
  }
}
