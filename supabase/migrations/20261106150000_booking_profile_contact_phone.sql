-- Phone number shown to parents after they open a request (optional per profile).
alter table public.therapist_booking_profiles
 add column if not exists contact_phone text check(contact_phone is null or contact_phone ~ '^\+9725[0-9]{8}$');
