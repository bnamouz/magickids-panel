-- Adult ADHD assessment track. Additive only: existing files, questionnaires and scores are unchanged
-- and every existing intake session keeps the default track 'child'.
-- Requires owner approval before it is applied to production.

-- The person assessed fills in one self-report instead of the parent and teacher questionnaires.
alter type public.questionnaire_type_enum add value if not exists 'asrs_adult';
alter type public.respondent_enum add value if not exists 'self';

-- Which track a file belongs to.
alter table public.intake_sessions add column if not exists track text not null default 'child';
alter table public.intake_sessions drop constraint if exists intake_sessions_track_check;
alter table public.intake_sessions add constraint intake_sessions_track_check check (track in ('child', 'adult'));
create index if not exists intake_sessions_track_idx on public.intake_sessions (track) where track <> 'child';

-- Self-report scores sit next to the parent / teacher / combined ones.
alter table public.scores drop constraint if exists scores_scope_check;
alter table public.scores add constraint scores_scope_check check (scope = any (array['parent'::text, 'teacher'::text, 'combined'::text, 'self'::text]));
