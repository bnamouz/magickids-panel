/** Shared filter logic for the clinic patients page and messaging API. */
export type PatientFilter = { f?: string; q?: string };
export function todayIL() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); }
export function applyFilters<T extends { is: any; not: any; gte: any; eq: any; or: any }>(query: T, { f = '', q = '' }: PatientFilter): T {
  let r: any = f === 'archived' ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  if (f === 'upcoming') r = r.gte('next_visit', todayIL());
  if (f === 'review') r = r.eq('needs_review', true);
  if (f === 'hw') r = r.eq('extra->>missing_height_weight', 'true');
  const words = q.replace(/[^\p{L}\p{N}' \-]/gu, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 4);
  for (const w of words) {
    const digits = w.replace(/\D/g, '');
    r = /^\d+$/.test(w)
      ? r.or(`national_id.ilike.%${digits}%,phone1.ilike.%${digits}%,phone2.ilike.%${digits}%`)
      : r.or(`first_name.ilike.%${w}%,last_name.ilike.%${w}%`);
  }
  return r;
}
