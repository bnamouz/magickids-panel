# Therapy and MOXO checks

## Public therapy requests
- Open /therapy/rana, /therapy/maissashakor, /therapy/hala, /therapy/lora,
  /therapy/sewar and /therapy/tagreednassrallahbn.
- Expect a request form, not a parent date or time selector.
- Retain service choices, published VAT-inclusive prices and contact details.
- Submission must remain pending therapist scheduling, not immediately book.
- Existing tracking links and scheduled appointments must remain valid.

## Therapist and staff access
- Unauthenticated admin and therapist data requests must not disclose requests.
- Authenticated scheduling, calendar collision protection and existing slot
  bookings must continue working; test locally with simulated Google.
- No production messages or test staff accounts may be created for QA.

## MOXO requests
- Open /moxo?lang=he, /moxo?lang=ar and /moxo?lang=en.
- Keep institute approval before appointment confirmation.
- Require the child's national ID and clearly ask parents
  to send the MOXO referral recommended by the diagnosing physician.
- Owner approved the additive identity migration on 2026-11-11; no upload
  endpoint or storage bucket is part of this change.

## General treatment requests
- /treatments remains a request-only form with contact and treatment selection.
- Require child's national ID consistently with the
  individual therapist forms, with server-side validation and staff visibility.

## Baseline observed 2026-11-11
- Rana and Maissa profiles use slots; four other enabled profiles use therapist_time.
- Rana public page visibly offers dates and time slots.
- MOXO public page offers contact details and optional date/time preferences,
  but neither a national ID field nor a referral instruction.
- Production schema has no national_id on treatment_requests or moxo_requests.
- Staff UI cannot be visually verified without an authorized staff session.

## Implemented and checked 2026-11-11
- All six enabled profiles now use therapist_time, including Rana and Maissa.
  No calendar events or existing appointments were changed.
- Additive national_id columns and service-role-only atomic submission RPCs
  applied successfully. Counts immediately before/after: 24 treatments and
  15 MOXO requests, all previous identity values remain null.
- Required 9-digit Israeli checksum validation, including Arabic and Persian
  numeral normalization. Identity never appears in parent tracking responses,
  WhatsApp URLs, or calendar notifications.
- Staff and assigned-therapist request views display the submitted ID, with
  an explicit missing-value fallback for older requests.
- MOXO referral instructions and institute WhatsApp button in Hebrew, Arabic
  and English remain visible both before submission and after confirmation.
  Form submission does not claim that the referral has been received.
- Browser QA on six therapist pages and general/MOXO pages in all three
  languages at 1360px and 375px: required identity field, no therapy time
  selectors, no horizontal overflow, no JavaScript page errors.
- Browser submissions use intercepted synthetic responses only. Therapist,
  general and MOXO success states verified; invalid identity prevents submit.
  Arabic-digit therapist submission normalizes to ASCII digits.
- PGlite executes the real SQL migrations: 27 route, scheduling, authorization,
  idempotency and migration-preservation checks pass with Google mocked.
- Existing treatment, therapist scheduling/access, MOXO hours, class email,
  intake and phone-validation checks pass. Dashboard navigation test updated
  from the legacy Rana link to the current all-therapist /admin/therapy link;
  legacy Rana page existence remains explicitly checked.
- No live test requests, notifications, temporary staff accounts or appointment
  writes were created. Staff screen visual QA remains excluded without an
  authorized staff session.

# Staff dashboard home redesign (2026-11-14)

## Existing flows that must keep working
- /admin/dashboard requires an authenticated staff user before any data loads.
- Case search: GET /admin/dashboard?q=…#case-directory opens the case
  directory with results, paging, archive view and restore.
- Every former data panel stays reachable: unified calendar with sync alert
  and sync button, today's institute appointments, calls needing follow-up
  with "טופל", pending treatment requests, cases ready to schedule and cases
  without progress with edit / archive / admin-only permanent delete.
- Intake counters link to /admin/intake by stage; seven quick links unchanged.
- A source that fails to load shows an alert and is never shown as empty.
- All 23 staff destinations stay in the navigation with current-page
  semantics and the mobile "תפריט הצוות" toggle; logout stays available.
- Other admin pages and /admin/login keep rendering.

## Requested change
- Apply the approved mockup (https://magickids-home-mockup.pplx.app):
  five-folder sidebar, breadcrumb top bar, "סקירה יומית" heading with the
  growth illustration, one KPI strip, a single prioritised "דורש טיפול"
  queue with tabs and filter, upcoming appointments, aspiration illustration,
  perspective entrance and a motion on/off control.
- No schema, API, storage or agent changes. Presentation and grouping only.

## Checked 2026-11-14 (local, synthetic data only)
- Type check clean; scripts/test-dashboard.mjs 8/8 including new checks for
  queue order, single highlighted item, preserved links and true totals.
- Browser at 1440, 1280x650, 820 and 375: no horizontal overflow, tabs,
  filter, clear, show-all, per-case actions, delete dialog positioned on the
  viewport, case search, folder toggle and restore, client navigation,
  breadcrumb, mobile menu.
- States: empty data, every source failing, calendar sync mismatch,
  assistant role. Motion: stored preference applied before paint, OS
  reduced-motion disables entrance and tilt.
- /admin/login is outside the new shell and unchanged.
- Not verifiable without an authorised staff session: the production UI
  with real data. Some admin pages cannot render against the local mock
  for reasons unrelated to this change (missing synthetic fields).

# Adult ADHD assessment track (2026-11-21)

## Existing flows that must keep working
- /onboarding/public (child intake), /questionnaire/parent/<token>,
  /questionnaire/teacher/<token> and /onboarding/status/<token> behave as
  before for every child file, including before the migration is applied:
  the child track reads intake_sessions.track on a separate, tolerant query
  and treats an unreadable column as "child".
- A child file is ready to schedule only after both the parent and the
  teacher questionnaire were submitted in full.
- Booking, the voice agent and staff appointment creation keep their gates.
- /admin/intake, /admin/sessions, the dashboard counters and the case
  directory list child files exactly as before.

## Requested change
- /adults (he / ar / en): a person aged 18–80 opens a file for their own
  assessment (name, national ID, birth date, phone, e-mail, consent) and is
  taken to /questionnaire/adult/<token>, the adult self-report.
- Self-report: background, Part A = the WHO ASRS-v1.1 six-question screener
  (official wording, unaltered, with citation and copyright notice), Part B =
  twelve institute-written items for the remaining DSM-5 symptoms, four
  childhood items, six impairment items, free text. Drafts save automatically.
- The person assessed is never shown a score. Staff see the screener result
  (original rule and the 2024 0–24 score), DSM-5 symptom counts with the adult
  threshold of five, childhood and impairment summaries, and every answer.
- An adult file needs no teacher questionnaire: it is ready to schedule once
  the self-report is submitted. The same booking and reminder paths are used.
- A returning adult continues the existing adult file (same link) and never
  receives a second one; another phone never receives the link.
- A person with an earlier child file under the same ID gets a separate adult
  file; the audit trail records the earlier patient record.
- Migration 20261121120000_adult_adhd_track.sql (additive: two enum values,
  intake_sessions.track default 'child', scores scope 'self') must be applied
  with owner approval BEFORE this code is deployed.
- Not in this change: automatic report generation and the Maccabi e-mail for
  adult files (hidden on the adult file page), and any change to the public
  marketing site.

## Checked 2026-11-21 (local, synthetic data only)
- scripts/test-adult-intake.mjs: question set integrity, published screener
  rules, DSM-5 counts, completeness, progress for both tracks, the real
  migration on PGlite (repeatable, existing rows stay 'child'), both public
  APIs end to end including refusal of child links, late drafts and a
  failing track column.
- Existing intake, booking, dashboard, voice and report checks still pass.
