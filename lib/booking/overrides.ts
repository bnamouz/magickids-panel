import { getSupabaseAdmin } from '@/lib/supabase';
import { HORIZON_DAYS, localParts, type Clinic, type DayOverrides } from './schedule';

/** Postgres `date` arrives as 'YYYY-MM-DD' through PostgREST and as a Date object through direct drivers (tests). */
const dayKey = (v: unknown) => typeof v === 'string' ? v.slice(0, 10) : new Date(v as Date).toISOString().slice(0, 10);
export type OverrideRow = { clinic: Clinic; day: string; closed: boolean; open_min: number | null; close_min: number | null; note: string | null; created_at: string; updated_at: string };

/** Staff-set day overrides for the booking horizon (today + HORIZON_DAYS). Fails closed: if the table cannot be read, booking is unavailable. */
export async function loadOverrides(clinic: Clinic, from = localParts(new Date()).date, days = HORIZON_DAYS + 1): Promise<DayOverrides> {
  const to = new Date(Date.parse(from + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
  const r = await getSupabaseAdmin().from('clinic_day_overrides').select('day,closed,open_min,close_min').eq('clinic', clinic).gte('day', from).lte('day', to);
  if (r.error) throw new Error('overrides_unavailable');
  const out: DayOverrides = {};
  for (const row of r.data ?? []) out[dayKey(row.day)] = row.closed ? { closed: true } : { closed: false, open: row.open_min!, close: row.close_min! };
  return out;
}
export async function listOverrides(fromDay: string) {
  const r = await getSupabaseAdmin().from('clinic_day_overrides').select('clinic,day,closed,open_min,close_min,note,created_at,updated_at').gte('day', fromDay).order('day').limit(200);
  if (r.error) throw new Error('overrides_unavailable');
  return (r.data ?? []).map(row => ({ ...row, day: dayKey(row.day) })) as OverrideRow[];
}
