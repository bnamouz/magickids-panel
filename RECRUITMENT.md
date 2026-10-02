# Recruitment and therapist lifecycle

- Staff dashboard `/admin/recruitment`: manual addition, name search/status filters, edit details and internal notes, contact/interview/accept/reject, confirmed permanent candidate deletion.
- Public `/recruitment`: Arabic/Hebrew/English, explicit consent, same-origin POST, strict validation, honeypot and service-only database RPC with five submissions/IP hash/hour and idempotency. No public read API. Historical email/WhatsApp applications are not imported.
- Acceptance creates a therapist transactionally exactly once, inactive with no working hours. Staff must configure hours and activate. A duplicate email blocks creation without overwriting existing therapist access.
- `/admin/therapists`: confirmed removal. Pending/contacted requests, future ongoing appointments or syncing events block removal. With past treatment history the profile is archived, active=false, its portal credential revoked, and all treatment records retained. Without history it is permanently deleted. Archived profiles can be restored inactive; an old portal link remains invalid. Deleting a recruitment candidate does not delete its therapist.
- Assignment trigger locks and checks the therapist so removal cannot leave a newly assigned request pointing at a deleted/inactive therapist. Existing assignments and historical rows remain intact.
- Tables/RPCs accessible only to the server service role; staff routes require authenticated clinic staff and same origin. No changes to reminder scheduler configuration or delivery claims.

Validation: `node scripts/test-recruitment.mjs`, `node scripts/test-therapists.mjs`, `npx tsc --noEmit`.
