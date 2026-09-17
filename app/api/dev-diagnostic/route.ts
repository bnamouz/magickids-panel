// Temporary diagnostic endpoint — REMOVE after verification
import { mailReady } from '@/lib/development/mail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  // Simple bearer token check
  const auth = req.headers.get('authorization') || '';
  const secret = process.env.DEVELOPMENT_REFERRALS_ENABLED || '';
  if (!secret || !auth.includes(secret)) {
    return new Response('unauthorized', { status: 401 });
  }

  const raw = process.env.DEVELOPMENT_GOOGLE_SERVICE_ACCOUNT_JSON || '';
  const info: any = {
    flag: process.env.DEVELOPMENT_REFERRALS_ENABLED,
    key_present: !!raw,
    key_length: raw.length,
    key_starts_with_brace: raw.startsWith('{'),
    key_has_private_key: raw.includes('BEGIN PRIVATE KEY'),
    mail_ready: mailReady(),
  };

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      info.client_email = parsed.client_email;
      info.project_id = parsed.project_id;
      info.client_id = parsed.client_id;
      info.key_type = parsed.type;
    } catch (e) {
      info.parse_error = String(e);
    }
  }

  return Response.json(info);
}
