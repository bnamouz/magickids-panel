import { getSupabaseAdmin } from '@/lib/supabase';
import { getCalendarClient } from '@/lib/google-calendar';
import { treatmentLabels, SLUG_RE } from './parent-booking';
import { validateRequestAvailability, type RequestAvailability, type RequestWindow } from './request-slots';

/** Wide default: the therapist narrows it from the portal. Sun–Thu 08:00–20:00, Fri 08:00–14:00. */
export function defaultAvailability(duration: number, hours: { day: number; start: number; end: number }[] = []): RequestAvailability {
  const d = [30, 45, 60, 90].includes(duration) ? duration : 60;
  const base = hours.length ? hours : [0, 1, 2, 3, 4].map(day => ({ day, start: 480, end: 1200 })).concat([{ day: 5, start: 480, end: 840 }]);
  const windows: RequestWindow[] = base
    .map(h => ({ day: h.day, start: h.start, end: h.start + Math.floor((h.end - h.start) / d) * d, duration: d }))
    .filter(w => w.end > w.start);
  return validateRequestAvailability({ windows, closedDates: [] });
}

export function slugFromEmail(email: string) {
  const v = email.split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
  return SLUG_RE.test(v) ? v : 'therapist-' + Math.random().toString(36).slice(2, 8);
}

/**
 * Give a therapist the same parent-request workflow as Rana: a dedicated Google calendar
 * (owned by the institute account), a booking profile with a public slug, and an active profile.
 * Idempotent: an existing profile is returned unchanged.
 */
export async function enableBookingProfile(therapistId: string, wantedSlug?: string) {
  const db = getSupabaseAdmin();
  const t = await db.from('therapists').select('*').eq('id', therapistId).maybeSingle();
  if (t.error || !t.data) return { error: 'not_found' as const };
  if (t.data.archived_at) return { error: 'archived' as const };
  const existing = await db.from('therapist_booking_profiles').select('slug,calendar_id,enabled').eq('therapist_id', therapistId).maybeSingle();
  if (existing.data) return { slug: existing.data.slug, calendarId: existing.data.calendar_id, created: false, shared: null as string | null };
  const slug = (wantedSlug ?? slugFromEmail(t.data.email)).toLowerCase();
  if (!SLUG_RE.test(slug)) return { error: 'invalid_slug' as const };
  const taken = await db.from('therapist_booking_profiles').select('therapist_id').eq('slug', slug).maybeSingle();
  if (taken.data) return { error: 'slug_taken' as const };
  const label = treatmentLabels(t.data.treatments).he;
  const calendar = getCalendarClient();
  let calendarId: string;
  try {
    const created = await calendar.calendars.insert({ requestBody: { summary: `${t.data.name} · ${label} · ילדי הקסם`, timeZone: 'Asia/Jerusalem' } });
    if (!created.data.id) throw new Error('no_id');
    calendarId = created.data.id;
  } catch { return { error: 'calendar_failed' as const }; }
  // The therapist sees her own calendar read-only in Google; all changes go through the portal.
  let shared: string | null = null;
  try { await calendar.acl.insert({ calendarId, sendNotifications: true, requestBody: { role: 'reader', scope: { type: 'user', value: t.data.email } } }); shared = t.data.email; } catch { shared = null; }
  const availability = defaultAvailability(t.data.duration, Array.isArray(t.data.hours) ? t.data.hours : []);
  const ins = await db.from('therapist_booking_profiles').insert({ therapist_id: therapistId, slug, calendar_id: calendarId, enabled: true, availability });
  if (ins.error) return { error: 'save_failed' as const, calendarId };
  if (!t.data.active) await db.from('therapists').update({ active: true, updated_at: new Date().toISOString() }).eq('id', therapistId);
  return { slug, calendarId, created: true, shared };
}
