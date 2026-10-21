create table if not exists public.clinic_day_overrides (
  clinic text not null check (clinic in ('pediatrics','adhd')),
  day date not null,
  closed boolean not null default false,
  open_min integer check (open_min is null or (open_min >= 0 and open_min < 1440)),
  close_min integer check (close_min is null or (close_min > 0 and close_min <= 1440)),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic, day),
  check (closed or (open_min is not null and close_min is not null and close_min > open_min))
);
comment on table public.clinic_day_overrides is 'Per-day clinic hour overrides set by staff: closed day or custom open/close minutes (Israel local time). Existing bookings are never touched.';
alter table public.clinic_day_overrides enable row level security;
insert into public.clinic_day_overrides (clinic, day, closed, open_min, close_min, note)
values ('pediatrics','2026-10-21', false, 600, 790, 'סגירה מוקדמת, תור אחרון 13:00')
on conflict (clinic, day) do nothing;
