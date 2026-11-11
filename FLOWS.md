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
