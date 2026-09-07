# Separate clinic booking

Public pages (Hebrew, Arabic and English):

- `https://app.magickidsinstitute.com/book/pediatrics?lang=he`
- `https://app.magickidsinstitute.com/book/adhd?lang=he`

The institute's GitHub Pages website links directly to these routes and preserves
the selected language. Each page shows only available times, never calendar event
details or another family's information. The original institute logo and doctor
portrait are reused from the institute website.

## Production activation

The pages can be deployed before activation. They show a phone contact option
until all server configuration is available; they do not display demo slots or a
false booking confirmation.

1. Apply `db/migrations/20260907_website_bookings.sql` to the app's existing
   Supabase database as the database owner. It adds one private table and a
   service-role-only reservation function. It does not alter clinical records.
2. Keep the existing `GOOGLE_SERVICE_ACCOUNT_JSON` and
   `GOOGLE_IMPERSONATE_USER`. Verify that this service-account identity can read
   and write both calendars, and that both appear in its CalendarList.
3. Set `PEDIATRICS_CALENDAR_ID` to the existing pediatrics calendar and
   `GOOGLE_CALENDAR_ID` to the verified ADHD calendar. The existing pediatrics
   helper's fallback ID remains supported. These must be distinct explicit IDs;
   `primary` is rejected. Do not infer the ADHD calendar from an email address.
4. Add `BOOKING_HASH_SECRET`, a newly generated private random secret of at least
   32 characters. Do not put it in a `NEXT_PUBLIC_` variable or in git.
5. Sign in as an active administrator and read `/api/admin/booking-status`.
   Confirm both names/IDs, writable access, database availability and secret
   presence. This endpoint never returns secrets or patient information.
6. Set `PUBLIC_BOOKING_ENABLED=true` and redeploy. Read both public availability
   endpoints, without creating a test patient or sending a test appointment.

No production configuration, schema migration, calendar access grant or real
booking is performed by the build or tests. Activation must be verified on the
actual deployment; a GitHub or Vercel connection alone does not activate it.

## Existing scheduling rules

Time zone: `Asia/Jerusalem`, including daylight saving changes. Booking window:
28 days, with a two-hour lead time.

Pediatrics uses the hours already published by the institute: Monday 09:00–16:00,
Tuesday and Wednesday 16:00–20:00, Thursday 17:00–20:00, Friday and Saturday
09:30–12:30; Sunday closed. Slots are 30 minutes.

ADHD assessments use the existing Wednesday 16:00–20:00, 60-minute workflow.
Booking requires a valid unexpired personal parent token and completed parent
and teacher questionnaires. The existing parent questionnaire completion screen
links to booking with the token in the fragment, which is removed on load.
The form also accepts the personal questionnaire link. New cases use the
existing `/register` intake. Follow-ups and Moxo remain with the existing staff
workflow; this change does not silently bypass assessment prerequisites.

Both calendars are checked for conflicts because the doctor is shared. Website
reservations across both clinics are serialized in PostgreSQL. Existing voice,
staff and direct Google Calendar writers still use their existing workflows;
they do not participate in this new reservation transaction. The booking API
checks both calendars again immediately before writing, but Google Calendar
itself does not provide an atomic cross-calendar availability-and-insert API.

## Confirmation, retries and cancellation

Confirmation requires an acknowledged private Google event in the selected
calendar and a confirmed database reservation. ADHD also saves the appointment
using the existing `session_id`, `gcal_event_id`, and `gcal_calendar_id` schema.
No automated email, WhatsApp message or invitation is sent by this flow.

Each request has one stable UUID and deterministic Google event ID. An uncertain
write keeps its reservation; the same request can reconcile and retry after two
minutes. A new request cannot take the same held time. The endpoint's 60-second
maximum duration is shorter than the two-minute attempt lease. Do not extend it
without also extending the lease. No pending reservation is released merely
because a network call failed.

Staff can cancel confirmed appointments in Google Calendar. Availability reads
reconcile confirmed reservations whose events were deleted/cancelled and release
those slots. If a write remains pending and the family cannot retry, staff must
check the specific `calendar_id`/`event_id` before releasing the reservation.
Never release a pending row based only on elapsed time: the Google write may
have succeeded. Moving an appointment manually requires corresponding review of
its reservation; do not change the calendar mapping while requests are pending.

Names and callback numbers are stored only in the private Google event. The
reservation table stores IDs, timing, state and keyed hashes; it is not publicly
readable. IP and phone limits are enforced in SQL. Request bodies, tokens and
Google error payloads are not logged or returned by public endpoints. The
public website service worker does not cache this separate clinic origin.

## Verification

```sh
npm ci
npm run test:booking
npm run build
```

Tests use the actual migration/RPC in PGlite PostgreSQL and a mocked Google
client. They cover calendar routing, intake prerequisites, cross-clinic overlap,
simultaneous retries, ambiguous writes, cancelled slots, time zones, write
permissions, rate limits, SQL privileges, public response privacy and origin
checks. PGlite has one connection: these tests validate reservation behavior and
SQL, rather than claiming a load test of production PostgreSQL concurrency.

Public-site validation lives in `bnamouz/dr-baseem-namouz-site`:
`node scripts/build-website.mjs` and `python scripts/verify-website.py`.
