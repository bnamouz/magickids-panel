import { createHmac } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { notifyOnce } from '@/lib/moxo/notification';
import { BookingError, bookingHash, bookingProfile, treatmentLabels } from './parent-booking';
import { notifyAssignment } from './workflow';

/** Reference prices shown to parents (₪, VAT included). COGFUN is only
 *  offered by therapists whose profile pricing lists it. */
export const OCCUPATIONAL_PRICES = { regular: 300, cogfun: 350 } as const;
export const INSTITUTE_ADDRESS = 'דאהר עומר אלזידאני 9, שפרעם';
export const INSTITUTE_MAP = 'https://maps.app.goo.gl/MG3eHopWuLA4imPH8';
export const INSTITUTE_PHONE_DISPLAY = '054-402-0043';

export type PriceLine = { label: string; price: number; note?: string };
export function parsePricing(value: unknown): PriceLine[] {
  if (!Array.isArray(value)) return [];
  return value.filter(v => v && typeof v.label === 'string' && Number.isFinite(Number(v.price)))
    .map(v => ({ label: String(v.label).slice(0, 120), price: Number(v.price), ...(v.note ? { note: String(v.note).slice(0, 60) } : {}) }));
}
export const isTherapistTime = (p: { booking_mode?: string | null }) => p.booking_mode === 'therapist_time';

/** Public page data for a therapist_time profile: no slots, no calendar call. */
export async function therapistTimeInfo(slug?: string) {
  const p = await bookingProfile(slug);
  const durations = [...new Set((p.availability.windows as { duration: number }[]).map(w => w.duration))];
  return { mode: 'therapist_time' as const, name: p.therapist.name, treatment: treatmentLabels(p.therapist.treatments), slug: p.slug,
    pricing: parsePricing(p.pricing), duration: (durations.length === 1 ? durations[0] : null) as number | null, timeZone: 'Asia/Jerusalem' };
}

/** Parent request without a time. Stored as a general treatment request that
 *  is pre-assigned to the therapist; the therapist picks the slot in her portal. */
export async function submitTherapistTimeRequest(b: { id: string; token: string; patient: string; contact: string; phone: string; note: string }, ip: string, slug?: string) {
  const p = await bookingProfile(slug);
  if (!isTherapistTime(p)) throw new BookingError('invalid_request', 400);
  const db = getSupabaseAdmin();
  const secret = process.env.BOOKING_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new BookingError('unavailable', 503);
  const hash = bookingHash(b.token);
  const existing = await db.from('treatment_requests').select('id,parent_hash,patient_name,contact_name,phone').eq('id', b.id).maybeSingle();
  if (existing.error) throw new BookingError('unavailable', 503);
  if (existing.data) {
    const r = existing.data;
    if (r.parent_hash !== hash || r.patient_name !== b.patient || r.contact_name !== b.contact || r.phone !== b.phone) throw new BookingError('invalid_retry');
    return { received: true, id: b.id };
  }
  const treatment = (p.therapist.treatments?.[0] as string | undefined) ?? 'other';
  const result = await db.rpc('submit_treatment_request', { p_id: b.id, p_patient: b.patient, p_contact: b.contact, p_phone: b.phone,
    p_ip: createHmac('sha256', secret).update(`treatment-ip:${ip}`).digest('hex'), p_treatment: treatment, p_language: 'he', p_availability: b.note });
  if (result.error) throw new BookingError('unavailable', 503);
  if (result.data !== 'received') throw new BookingError(result.data, result.data === 'rate_limited' ? 429 : 409);
  // Bind to the therapist and keep the tracking capability. Consent on the page
  // covers the confirmation message and the reminder before the session.
  const bound = await db.from('treatment_requests').update({ therapist_id: p.therapist_id, therapist: p.therapist.name, parent_hash: hash,
    reminder_consent: true, updated_at: new Date().toISOString() }).eq('id', b.id).eq('status', 'pending').select('id').maybeSingle();
  if (bound.error || !bound.data) throw new BookingError('unavailable', 503);
  // Tell the therapist right away (once per request); the worker retries later.
  const t = await db.from('therapists').select('*').eq('id', p.therapist_id).maybeSingle();
  if (t.data) await notifyAssignment(b.id, t.data).catch(() => null);
  return { received: true, id: b.id };
}

/** Parent tracking view for a therapist_time request. */
export async function therapistTimeStatus(id: string, token: string) {
  const r = await getSupabaseAdmin().from('treatment_requests')
    .select('id,status,scheduled_at,duration_minutes,calendar_sync,therapist_id,created_at')
    .eq('id', id).eq('parent_hash', bookingHash(token)).maybeSingle();
  if (r.error) throw new BookingError('unavailable', 503);
  if (!r.data) throw new BookingError('not_found', 404);
  const d = r.data;
  const status = d.status === 'closed' ? 'closed' : d.status === 'scheduled' ? (d.calendar_sync === 'synced' ? 'confirmed' : 'syncing') : 'awaiting_time';
  return { mode: 'therapist_time' as const, id: d.id, status, starts_at: d.scheduled_at,
    ends_at: d.scheduled_at ? new Date(Date.parse(d.scheduled_at) + (d.duration_minutes ?? 0) * 60000).toISOString() : null,
    duration: d.duration_minutes, created_at: d.created_at };
}

const fmtDate = (s: string) => new Intl.DateTimeFormat('he-IL-u-nu-latn', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(s));
const fmtTime = (s: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(s));

/** WhatsApp from the institute number once the therapist fixed the time.
 *  Idempotent per request+time; only for therapist_time profiles. */
export async function notifyTherapistTimeSet(requestId: string, slug?: string) {
  const p = await bookingProfile(slug);
  if (!isTherapistTime(p)) return 'skipped';
  const r = await getSupabaseAdmin().from('treatment_requests').select('id,contact_name,patient_name,phone,status,scheduled_at,duration_minutes,calendar_sync,therapist_id')
    .eq('id', requestId).eq('therapist_id', p.therapist_id).maybeSingle();
  if (r.error || !r.data || r.data.status !== 'scheduled' || r.data.calendar_sync !== 'synced' || !r.data.scheduled_at) return 'skipped';
  const d = r.data, first = p.therapist.name.split(' ')[0], label = treatmentLabels(p.therapist.treatments).he;
  const price = parsePricing(p.pricing)[0];
  const lines = [
    `שלום ${d.contact_name},`,
    `נקבע לכם מפגש ${label} עם ${first} במכון ילדי הקסם עבור ${d.patient_name}:`,
    `יום ${fmtDate(d.scheduled_at)} בשעה ${fmtTime(d.scheduled_at)} (${d.duration_minutes} דקות).`,
    price ? `עלות המפגש: ${price.price} ₪${price.note ? ' ' + price.note : ''}.` : '',
    `כתובת: ${INSTITUTE_ADDRESS}`,
    `מפה: ${INSTITUTE_MAP}`,
    `לשינוי או ביטול השיבו להודעה זו או התקשרו ${INSTITUTE_PHONE_DISPLAY}.`,
  ].filter(Boolean);
  return notifyOnce(`therapy-time-set:${d.id}:${d.scheduled_at}`, d.phone, lines.join('\n'), { sender: 'institute' });
}
