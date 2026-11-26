# Therapist workflow

Staff: `/admin/therapists`; personal portal: `/therapist#id=...&token=...`.
The portal credential is HMAC-bound to a revocable therapist version, expires after 90 days, is sent only in POST bodies and never in the page query/path. Active staff can edit profiles, issue/revoke links, and assign requests. Therapists can only see/schedule/cancel assigned requests and edit their own availability. No patient records, diagnoses or questionnaire answers are sent in invitation emails or Google event descriptions.

Availability uses Israel time, weekly day/time windows, inclusive date exceptions and default session duration. Multiple windows express breaks. Slot suggestions cover 28 days; server validation allows up to 90 days. Staff must confirm that the parents agreed and that a room is available. Free-text parent preferences are displayed, not interpreted as a guaranteed match. A single eligible therapist with an available slot is auto-assigned. Multiple/no matches remain for staff selection. The SQL RPC serializes scheduling and validates overlap, current assignment, active state, working hours and leave. Existing scheduled appointments are not cancelled when hours change.

## Integrations
- Calendar: existing `GOOGLE_SERVICE_ACCOUNT_JSON`; `TREATMENT_CALENDAR_ID` optionally overrides existing `GOOGLE_CALENDAR_ID`. Deterministic event IDs, private event content, sync status and retry are visible. No success claim on failed sync. Existing appointments are only synced after staff scheduling/update or explicit retry; deployment itself does not rewrite old appointments.
- Gmail: `TREATMENT_GOOGLE_SERVICE_ACCOUNT_JSON`, falling back to existing `DEVELOPMENT_GOOGLE_SERVICE_ACCOUNT_JSON`. Workspace delegation of `gmail.send` for `magickids@magickidsinstitute.com` is required. Configuration presence is not evidence of authorization or delivery. Notification claims prevent repeated sends; ambiguous failures remain unknown/sending for manual review, never blind retry.
- Parent reminders: existing UltraMsg settings, explicit optional `reminderConsent` checkbox. Existing requests default to no consent. Therapist reminders use email.
- Worker: `/api/cron/treatments`, Bearer `CRON_SECRET` (at least 32 characters), every five minutes through an external scheduler; no Vercel cron is enabled on the current plan. Worker heartbeat is displayed in therapist management; missing/stale heartbeat is not shown as active automation. The send window is 60–120 minutes before the appointment; cancellation and rescheduling invalidate old timing. Reminders are keyed by appointment/date/recipient.
- Calendar popup/email reminders apply to the organizer calendar; personal Google notification preferences can affect delivery.

No real invitations or appointment reminders were sent during development. Add actual therapist emails in the authenticated management page and verify one invitation and calendar sync before relying on automation.

## Appointment edits (reschedule, cancel, remove)
Both therapist surfaces (`POST /api/therapist` and `POST /api/therapist/[slug]`, same auth/ownership as before; staff on the diary are recorded as actor `staff`) accept:
- `change_preview` `{requestId, kind:'reschedule'|'cancel', reason, start?, note?}` → `{text}` (exact parent WhatsApp, no side effects).
- `reschedule` `{requestId, start, reason, note, notify}` → `{status:'rescheduled', calendar, whatsapp}`. Only `scheduled` rows; general portal validates `therapists.hours`/leave, diary validates the booking-profile slots (own current slot excluded). Duration is kept, the same calendar event moves. If the new slot fails nothing changes.
- `cancel_appointment` `{requestId, reason, note, notify}` → `{status:'cancelled', calendar, whatsapp}`. Row back to `contacted`, `scheduled_at` cleared, event deleted (a fresh event id is stored for the next booking because Google keeps deleted ids as tombstones), no reminder.
- `remove_patient` `{requestId, reason, note?}` → `{status:'removed', calendar}`. Row `closed`; never messages parents.
Reasons come from `lib/therapists/change-reasons.ts`; `other` needs a note; notes ≤300 chars, no links/domains, no control/bidi/zero-width characters. Parent messages (he/ar/en) are sent with `notifyOnce('treatment-change:<change id>', phone, text, {sender:'institute'})` only after the database change succeeded and never when `notify` is false. `read` responses add `changes` (newest 5) per request. Old `close` / `close_referral` still work.

Storage: `treatment_request_changes` (RLS, service role only) plus the SQL functions `reschedule_treatment_request`, `cancel_treatment_appointment`, `remove_treatment_patient` (same advisory lock as scheduling) in `supabase/migrations/20261127090000_treatment_request_changes.sql`. **Apply this migration before deploying the code**; until then the new actions fail with `unavailable` and history lists are empty.

## Validation
`node scripts/test-therapists.mjs`
`node scripts/test-treatment-validation.mjs`
`node scripts/test-treatments.mjs`
`node scripts/test-appointment-changes.mjs`
`npx tsc --noEmit`

## Hosting limitation
The current Vercel account rejects sub-daily cron schedules. No Vercel cron is installed. Configure an external scheduler to GET https://app.magickidsinstitute.com/api/cron/treatments every five minutes with Authorization: Bearer CRON_SECRET (32+ characters, stored in scheduler secrets and Vercel Production). Alternatively enable a supported Vercel plan and add the schedule. Until a worker heartbeat is observed, automatic reminders are NOT active. Do not put credentials in query strings.
