# Child development referrals — implementation and release gates

This branch is an **incomplete, disabled-by-default intake pilot**, not a completed import of Maccabi questionnaires. Do not describe it as a live integration.

Routes: staff `/admin/development`; personal parent/educator `/development#TOKEN`. Parent submission generates an educator link for manual sharing. Each respondent sees only their own answers. Server stores token hashes, expires access after 30 days, locks submissions, and restricts all writes and clinical review to authorized staff. The summary is a deterministic, source-attributed compilation, not a diagnosis or standardized score.

The current supplementary forms cover ages 1 to before 7. They do **not** replicate all official questions. Before approval staff must attach completed official parent and educator PDFs, referral, and signed consent. This interim design deliberately blocks dispatch without those originals. Full official mobile transcription, infant forms, and clinical/form-owner validation remain outstanding.

## Configuration and rollout (not performed)

1. Apply `db/migrations/20260915_development_referrals.sql` to a staging Supabase project. It creates isolated RLS-protected tables and a private PDF bucket. No production migration has been applied by this change.
2. Configure server-only `RESEND_API_KEY` and `DEVELOPMENT_EMAIL_FROM` using a verified sending domain. No credentials belong in client variables or Git. Existing Supabase server credentials are also required.
3. Set `DEVELOPMENT_REFERRALS_ENABLED=true` only in a controlled staging environment for testing. Leave production unset until all gates below pass.
4. Verify synthetic parent submission → educator submission → document upload → doctor review → generated PDF → provider acceptance → recipient delivery. The fixed destination is the exact address supplied by the clinic owner: `zfn_shraam_child@mac.org.il`. Do not send test messages there without coordinating with the clinic. A provider ID is not evidence of delivery or Maccabi system ingestion.
5. Validate PDF Hebrew shaping, long-answer pagination, mobile accessibility, retention policy, recovery paths, staff least-privilege requirements, and full official questionnaire mapping before production rollout.
6. Configure provider delivery events with verified signatures (not yet implemented). API acceptance is shown separately from delivery. For ambiguous dispatch, the system stops at `unknown` and does not auto-retry; inspect provider using idempotency key `development-<case-id>` before any recovery. A crashed upload can leave `uploading`; a crashed request can leave `sending`. Recovery must inspect storage/provider state before resetting, with an audit trail (operator recovery UI outstanding).
7. Existing project uses Next 14.2.15. Dependency installation reports a known security advisory. Upgrade and verify the platform before exposing new medical data workflows.

## Automated verification

`node --test scripts/test-development.mjs` validates age boundaries, form completeness/source attribution, migration execution, anonymous access denial, and single dispatch claim using PGlite. `npx tsc --noEmit` verifies TypeScript. These do not substitute for a deployed browser-to-email test.

No live patient data was sent, no production environment variables were changed, and this change does not establish an API integration with Maccabi.
