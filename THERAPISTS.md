# Therapist workflow

Staff: `/admin/therapists`; personal portal: `/therapist#id=...&token=...`.
The portal credential is HMAC-bound to a revocable therapist version, expires after 90 days, is sent only in POST bodies and never in the page query/path. Active staff can edit profiles, issue/revoke links, and assign requests. Therapists can only see/schedule/cancel assigned requests and edit their own availability. No patient records, diagnoses or questionnaire answers are sent in invitation emails or Google event descriptions.

Availability uses Israel time, weekly day/time windows, inclusive date exceptions and default session duration. Multiple windows express breaks. Slot suggestions cover 28 days; server validation allows up to 90 days. Staff must confirm that the parents agreed and that a room is available. Free-text parent preferences are displayed, not interpreted as a guaranteed match. A single eligible therapist with an available slot is auto-assigned. Multiple/no matches remain for staff selection. The SQL RPC serializes scheduling and validates overlap, current assignment, active state, working hours and leave. Existing scheduled appointments are not cancelled when hours change.

## Integrations
- Calendar: existing `GOOGLE_SERVICE_ACCOUNT_JSON`; `TREATMENT_CALENDAR_ID` optionally overrides existing `GOOGLE_CALENDAR_ID`. Deterministic event IDs, private event content, sync status and retry are visible. No success claim on failed sync. Existing appointments are only synced after staff scheduling/update or explicit retry; deployment itself does not rewrite old appointments.
- Gmail: `TREATMENT_GOOGLE_SERVICE_ACCOUNT_JSON`, falling back to existing `DEVELOPMENT_GOOGLE_SERVICE_ACCOUNT_JSON`. Workspace delegation of `gmail.send` for `magickids@magickidsinstitute.com` is required. Configuration presence is not evidence of authorization or delivery. Notification claims prevent repeated sends; ambiguous failures remain unknown/sending for manual review, never blind retry.
- Parent reminders: existing UltraMsg settings, explicit optional `reminderConsent` checkbox. Existing requests default to no consent. Therapist reminders use email.
- Worker: `/api/cron/treatments`, Bearer `CRON_SECRET` (at least 32 characters), every five minutes in vercel.json. Requires a hosting plan that supports this cadence. Worker heartbeat is displayed in therapist management; missing/stale heartbeat is not shown as active automation. The send window is 60–120 minutes before the appointment; cancellation and rescheduling invalidate old timing. Reminders are keyed by appointment/date/recipient.
- Calendar popup/email reminders apply to the organizer calendar; personal Google notification preferences can affect delivery.

No real invitations or appointment reminders were sent during development. Add actual therapist emails in the authenticated management page and verify one invitation and calendar sync before relying on automation.

## Validation
`node scripts/test-therapists.mjs`
`node scripts/test-treatment-validation.mjs`
`node scripts/test-treatments.mjs`
`npx tsc --noEmit`
