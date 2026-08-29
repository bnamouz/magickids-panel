import { NextRequest, NextResponse } from 'next/server';
import { google, calendar_v3 } from 'googleapis';
import { assertNourAuth } from '@/lib/nour-auth';

/**
 * POST /api/nour/admin/share-calendars
 *
 * One-time admin action: bidirectional calendar sharing setup.
 * - Grants magickids@ reader on bnamouz@'s primary calendar
 * - Grants bnamouz@ reader on magickids@'s calendars (personal + clinic)
 *
 * Uses Service Account with DWD, impersonating each calendar owner as needed.
 *
 * Body: {
 *   pairs: [
 *     { owner: "bnamouz@magickidsinstitute.com", grant_to: "magickids@magickidsinstitute.com", calendar_id: "primary" },
 *     ...
 *   ]
 * }
 *
 * Auth: Requires Nour bearer token.
 */
export const runtime = 'nodejs';

interface SharePair {
  owner: string;         // must impersonate this user (Workspace member)
  grant_to: string;      // email to grant reader access to
  calendar_id: string;   // 'primary' or a specific calendar ID
  role?: 'reader' | 'writer' | 'freeBusyReader';
}

function getCalendarClientFor(impersonate: string): calendar_v3.Calendar {
  const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!jsonStr) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured');

  const credentials = JSON.parse(jsonStr);

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject: impersonate,
  });

  return google.calendar({ version: 'v3', auth });
}

export async function POST(req: NextRequest) {
  const unauth = assertNourAuth(req);
  if (unauth) return unauth;

  let body: { pairs: SharePair[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
  }

  if (!Array.isArray(body.pairs) || body.pairs.length === 0) {
    return NextResponse.json({ success: false, error: 'pairs_required' }, { status: 400 });
  }

  const results: any[] = [];

  for (const pair of body.pairs) {
    const { owner, grant_to, calendar_id, role = 'reader' } = pair;
    try {
      const cal = getCalendarClientFor(owner);

      // Check existing ACLs
      const acls = await cal.acl.list({ calendarId: calendar_id });
      const existing = (acls.data.items || []).find(
        (r) => r.scope?.type === 'user' && r.scope?.value === grant_to
      );

      if (existing) {
        results.push({
          owner,
          grant_to,
          calendar_id,
          action: 'already_has_access',
          current_role: existing.role,
        });
        continue;
      }

      const rule = await cal.acl.insert({
        calendarId: calendar_id,
        requestBody: {
          role,
          scope: { type: 'user', value: grant_to },
        },
        sendNotifications: false,
      });

      results.push({
        owner,
        grant_to,
        calendar_id,
        action: 'access_granted',
        rule_id: rule.data.id,
        role: rule.data.role,
      });
    } catch (err: any) {
      results.push({
        owner,
        grant_to,
        calendar_id,
        success: false,
        error: err?.message || String(err),
      });
    }
  }

  return NextResponse.json({ success: true, results });
}
