import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { assertNourAuth } from '@/lib/nour-auth';

/**
 * POST /api/nour/admin/share-clinic-calendar
 *
 * One-time admin action: grants bnamouz@ read-only ACL on the clinic calendar
 * (magickids@). Uses the SAME Service Account with DWD, but impersonates
 * magickids@ (the calendar owner) so it can insert an ACL rule.
 *
 * Auth: Requires Nour bearer token (same as all /api/nour/* endpoints)
 */
export const runtime = 'nodejs';

const CLINIC_CAL_ID =
  'c_e9c403e90ff242b4ac1266588def0d111bb2974d693342bfbc6af4e0f00f31f0@group.calendar.google.com';
const PERSONAL_USER = 'bnamouz@magickidsinstitute.com';
const CLINIC_OWNER = 'magickids@magickidsinstitute.com';

export async function POST(req: NextRequest) {
  const unauth = assertNourAuth(req);
  if (unauth) return unauth;

  const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!jsonStr) {
    return NextResponse.json({ success: false, error: 'sa_not_configured' });
  }

  let credentials;
  try {
    credentials = JSON.parse(jsonStr);
  } catch (e) {
    return NextResponse.json({ success: false, error: 'sa_invalid_json' });
  }

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject: CLINIC_OWNER, // Must impersonate the calendar owner to grant ACL
  });

  const calendar = google.calendar({ version: 'v3', auth });

  try {
    // List existing ACLs
    const acls = await calendar.acl.list({ calendarId: CLINIC_CAL_ID });
    const existing = (acls.data.items || []).find(
      (r) =>
        r.scope?.type === 'user' && r.scope?.value === PERSONAL_USER
    );

    if (existing) {
      // Ensure it's at least reader-level
      if (['reader', 'writer', 'owner', 'freeBusyReader'].includes(existing.role || '')) {
        return NextResponse.json({
          success: true,
          action: 'already_has_access',
          current_role: existing.role,
          message: `${PERSONAL_USER} already has "${existing.role}" access to the clinic calendar`,
        });
      }
    }

    // Insert reader ACL
    const rule = await calendar.acl.insert({
      calendarId: CLINIC_CAL_ID,
      requestBody: {
        role: 'reader',
        scope: { type: 'user', value: PERSONAL_USER },
      },
      sendNotifications: false,
    });

    return NextResponse.json({
      success: true,
      action: 'access_granted',
      rule_id: rule.data.id,
      role: rule.data.role,
      message: `Granted "reader" access to ${PERSONAL_USER}. Open Google Calendar and the clinic calendar should appear under "Other calendars".`,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: 'acl_error',
      details: err?.message || String(err),
      full: err?.errors,
    });
  }
}
