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
- MOXO through Maccabi (2026-11-24): a family that books an ADHD assessment
  with Maccabi and asks for a MOXO test is told, beside the MOXO choice and
  again on the confirmation screen, to send the referral from the referring
  physician on WhatsApp. The institute uses it to check eligibility for the
  test through Maccabi Sheli, and the referral must still be valid. The same
  requirement is stated in the referral box of /moxo. The calendar event of
  such a booking carries a staff reminder (lib/booking/fund-lines.ts). Text
  only: no upload, no schema change, no message is sent automatically.
  Checked by scripts/test-moxo-referral.mjs.
- Referral upload on /moxo (2026-11-24, owner request): the form has an
  optional file field for the physician's referral (photo or PDF, up to 4 MB;
  photos are reduced in the browser). The file travels with the request to
  /api/moxo/requests, its type is read from the file itself, and it is kept in
  the existing private adhd-payments bucket under moxo/<request id>/. The
  request row records referral_path, referral_type and referral_uploaded_at
  (migration 20261124120000_moxo_referral_upload.sql, additive).
  - The referral stays optional for a request that is not through Maccabi: a
    family that cannot attach a file sends it on WhatsApp as before.
  - A wrong file type or an oversized file is refused before anything is
    saved. If the file cannot be stored, or more than 40 referrals arrived in
    24 hours, the request is still saved and the family is asked to send the
    referral on WhatsApp.
  - Staff see on /admin/moxo whether a referral was attached and open it
    through a five-minute link; each opening is written to audit_log as
    moxo_referral_viewed.
  - Nothing is sent to the family automatically. Checked by
    scripts/test-moxo-referral-upload.mjs.
- Referral mandatory through Maccabi (2026-11-24, owner request): /moxo has no
  health-fund field, so the form asks "requesting the test through Maccabi".
  When it is ticked the referral file is required: the browser does not send
  the form without it and /api/moxo/requests answers 400 referral_required
  before anything is saved. The row is marked via_maccabi (migration
  20261124140000_moxo_via_maccabi.sql, one additive boolean column, default
  false) and /admin/moxo reminds staff to verify that the referral is valid
  and to check eligibility in Maccabi Sheli.
  - If the file of a Maccabi request cannot be stored (storage failure or the
    daily cap), the request is still saved and marked; staff see that the
    file is missing and ask the family for it on WhatsApp.
  - The ADHD booking page (/book/adhd) still asks for the referral on WhatsApp
    only; it has no upload field.

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

# Prescription renewals (2026-11-23)

## What it is
- /prescription (he / ar / en, not indexed): a family of a patient who was
  already assessed asks for a prescription to continue treatment. They fill in
  the details, pay (bank transfer or Bit) and attach the payment proof.
- One month: 300 ILS + 18% VAT = 354 ILS. Three months: 500 ILS + VAT =
  590 ILS. The form shows the base price and the amount to pay.
- /admin/prescriptions (manager only): the manager sees the request, the proof
  and any summary, and issues or rejects. Each decision sends one WhatsApp
  from the institute number and is written to the audit log.
- Paying and submitting never issues a prescription; the doctor decides.

## Rule: "known to the system" (מטופל מוכר למערכת)
Source of truth: lib/prescriptions/match.ts (recognisePatient). Every request
is classified once, on submission, as diagnosed, file_only or unknown.

Step 1 — is there a file for this person? A file counts only if one of these
holds; archived files never count:
- the national ID on the request equals the ID on the file AND a second detail
  also fits: the birth date on the file, or the phone on the request is one of
  the parents' phones on the file; or
- for older files that have no national ID: the birth date fits AND the first
  name on the file opens the name typed in the request AND the phone on the
  request is one of the parents' phones on the file.
Typing an ID alone never confirms that somebody is a patient. Phones are
compared by their last nine digits; names ignore vowel marks, punctuation,
spacing and interchangeable Arabic letter forms.

Step 2 — is an assessment at the institute documented in that file? Any one of
these is enough:
- a file (intake session) whose status is attended, moxo_pending or reported;
- a report or a doctor's clinical assessment saved on a file that was not
  cancelled;
- an appointment in the past that is not a MOXO test and was not cancelled,
  missed (no_show) or rescheduled.

Result:
- diagnosed ("known to the system"): Step 1 and Step 2 both hold. No summary
  is required.
- file_only: a file was found but no assessment is documented in it.
- unknown: no file fits the details.
- file_only and unknown are treated the same way: the request is refused
  until at least one summary of the earlier assessment is attached (image or
  PDF, up to three files). The public form shows one identical message in both
  cases and never says whether a file exists.

Enforced in two places: app/api/prescriptions/route.ts answers 409
summary_required, and the table constraint prescription_summary_required
refuses a row that is not diagnosed and has no summary.

The classification is saved on the request and shown to the manager with a
link to the matched file. It only decides whether a summary is mandatory; it
does not approve anything. Most long-standing patients have no national ID or
documented assessment in the system yet, so they will be asked for a summary.

בעברית, בקצרה: מטופל מוכר למערכת רק אם (1) תעודת הזהות שהוזנה תואמת תיק
לא מאורכב, יחד עם תאריך לידה או טלפון תואמים — ובתיקים ישנים בלי תעודת זהות:
תאריך לידה, שם פרטי וטלפון יחד; וגם (2) מתועד בתיק אבחון במכון: סטטוס תיק
attended, moxo_pending או reported, דוח או הערכת רופא שמורים, או תור עבר
שאינו MOXO ולא בוטל, לא הוחמץ ולא נדחה. כל מי שאינו מוכר חייב לצרף סיכום
אבחון קודם.

## Changing the rule
- Change lib/prescriptions/match.ts and this section together.
- scripts/test-prescriptions.mjs must keep passing, in particular "known to
  the system only with a documented assessment and a second matching detail"
  and "public request: a known patient needs no summary, anyone else must
  attach one".
- Migration 20261123120000_prescription_renewals.sql (two private tables,
  service role only) is applied in production.

# Maccabi imaging approval desk (2026-11-25)

## Existing flows that must keep working
- /admin/secretaries (admin and secretary roles): the commitment desk (Form 17)
  sends one e-mail with the attached documents to the Maccabi branch
  (shfaram@mac.org.il), reminds after 3 business days (up to 3 reminders),
  reads the replies of its own thread only, and tells the family by WhatsApp
  only when staff press the button or the reply clearly says "ready".
- The subject, body, reminder and WhatsApp text of a commitment request are
  unchanged. scripts/test-maccabi-commitments.mjs and
  scripts/test-maccabi-mail.mjs must keep passing untouched.
- The daily cron (app/api/cron/maccabi-commitments) keeps one entry point for
  both kinds of request.

## Requested change (owner, 2026-11-25)
A second desk on the same page: ask Maccabi to approve an imaging test that was
recommended for a patient, attach the recommendation, and send it to the
imaging approval centre.

- One e-mail to both addresses: DimutRequest@mac.org.il and
  ImageConsult@mac.org.il (MACCABI_IMAGING_EMAILS in
  lib/maccabi/commitment-shared.ts). The first is the address Maccabi
  publishes for CT, MRI and nuclear-scan approvals. The second was added on
  the owner's instruction and has no public source.
- The recommendation document is mandatory, in the browser and on the server
  (400 recommendation_required). Nothing is sent without it.
- Fields: imaging type (IMAGING_TYPES) and the examined area or detail.
- Maccabi states up to 5 business days for handling, so the automatic reminder
  goes out on the 6th business day (IMAGING_REMINDER_AFTER_BUSINESS_DAYS), up
  to 3 reminders. Commitment requests stay at 3 days.
- A reply on an imaging thread is never classified by the model and never
  messages the family by itself: the request moves to "reply received, to
  check" and a staff member presses "the test was approved, update the
  family". Maccabi often answers through the doctor or Maccabi Online and not
  by e-mail, so the button also works with no reply.
- Storage: two additive columns on maccabi_commitments, kind ('commitment' by
  default, or 'imaging') and recipient_email (migration
  20261125120000_maccabi_imaging_requests.sql). Without the migration the
  commitment desk works exactly as before and an imaging request is refused
  before any e-mail is sent (503 imaging_not_ready).
- Audit: maccabi_imaging_requested, plus the existing reminder, reply and
  ready actions with the kind in the metadata.
- Small related fix: the long scope address in the amber setup banner wraps
  instead of pushing the page 52px wide on a phone (it did so on main).

## Checked 2026-11-25 (local, synthetic data only, no real e-mail or WhatsApp)
- npm run test:maccabi: 23 of 23, including 12 new checks in
  scripts/test-maccabi-imaging.mjs (recipients, subject, body, reminder day,
  manual-only replies, WhatsApp text in Hebrew and Arabic, refusal on the old
  schema).
- Browser run against a local stand-in for Supabase, Gmail and UltraMsg, 29
  checks: commitment request still goes to the branch with the same subject;
  imaging request without a file is refused; with a file one e-mail goes to
  both addresses with the attachment; reminder goes to the same thread and
  addresses; a reply moves the request to manual review and sends nothing to
  the family; the staff button sends the imaging WhatsApp text; cancel; the
  two lists stay separate; desktop 1280 and phone 375 with no horizontal
  overflow and no console errors.
- Old schema run: commitment request still sent, imaging request refused with
  no e-mail.
- npx tsc --noEmit and next build pass.
- Not checked: a real e-mail to Maccabi and whether ImageConsult@mac.org.il
  accepts mail.

## Changing it
- Addresses and reminder days: lib/maccabi/commitment-shared.ts.
- E-mail and WhatsApp wording: lib/maccabi/commitments.ts (kind 'imaging').
- Keep "imaging replies are manual" unless the owner asks otherwise; the test
  "service: a Maccabi answer on an imaging request never notifies the family by
  itself; the desk confirms it" guards it.
