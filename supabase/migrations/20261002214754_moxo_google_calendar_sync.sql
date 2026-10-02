alter table public.moxo_requests
 add column if not exists calendar_status text not null default 'pending' check (calendar_status in ('pending','synced','failed','not_configured')),
 add column if not exists google_calendar_id text,
 add column if not exists google_event_id text,
 add column if not exists calendar_synced_at timestamptz;
