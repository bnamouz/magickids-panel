-- Therapist-set appointment time ("therapist_time") and a public price list per
-- booking profile. Default 'slots' keeps existing parent self-selection flows.
alter table public.therapist_booking_profiles
 add column if not exists booking_mode text not null default 'slots' check(booking_mode in ('slots','therapist_time')),
 add column if not exists pricing jsonb not null default '[]'::jsonb check(jsonb_typeof(pricing)='array');
-- Requests sent from a therapist_time parent page are stored as general
-- treatment requests pre-assigned to the therapist. The parent keeps a hashed
-- tracking capability, exactly like parent booking requests.
alter table public.treatment_requests
 add column if not exists parent_hash text check(parent_hash is null or length(parent_hash)=64);
create index if not exists treatment_requests_parent_hash on public.treatment_requests(parent_hash) where parent_hash is not null;
update public.therapist_booking_profiles set booking_mode='therapist_time',
 pricing='[{"label":"ריפוי בעיסוק · מפגש של 45 דקות","price":300,"note":"כולל מע\"מ"}]'::jsonb,
 updated_at=now()
 where slug='hala';
