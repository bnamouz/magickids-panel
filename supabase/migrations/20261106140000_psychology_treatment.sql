-- New treatment type "psychology" (טיפול פסיכולוגי). Index-aligned label lists
-- live in lib/treatments/schema.ts; here only the allowed-value constraints change.
alter table public.treatment_requests drop constraint if exists treatment_requests_treatment_check;
alter table public.treatment_requests add constraint treatment_requests_treatment_check
 check(treatment in ('speech','occupational','emotional','parent-guidance','groups','other','psychology'));
alter table public.recruitment_candidates drop constraint if exists recruitment_candidates_treatments_check;
alter table public.recruitment_candidates add constraint recruitment_candidates_treatments_check
 check(cardinality(treatments) between 1 and 7);
