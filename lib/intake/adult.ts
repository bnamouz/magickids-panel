import type { SupabaseClient } from '@supabase/supabase-js';

/** Adult ADHD track: ages accepted by the public form /adults. Younger people use the child track. */
export const ADULT_MIN_AGE = 18, ADULT_MAX_AGE = 80;
/** Completed years of age on `today`; NaN for an unreadable date. */
export function ageOn(birthDate: string, today = new Date()) {
  const birth = new Date(birthDate);
  if (!Number.isFinite(birth.getTime())) return NaN;
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export type IntakeTrack = 'child' | 'adult';

/**
 * The track of each file, read on its own query. Pages and the child form that only need to tell the two
 * tracks apart keep working if the column cannot be read: every file then counts as a child file, which is
 * what all files were before the adult track existed. `null` means the tracks could not be read.
 */
export async function sessionTracks(db: SupabaseClient, sessionIds: string[]): Promise<Map<string, IntakeTrack> | null> {
  if (!sessionIds.length) return new Map();
  try {
    const { data, error } = await db.from('intake_sessions').select('id,track').in('id', sessionIds);
    if (error) return null;
    return new Map((data ?? []).map((row: any) => [row.id as string, row.track === 'adult' ? 'adult' : 'child']));
  } catch { return null; }
}
export async function sessionTrack(db: SupabaseClient, sessionId: string): Promise<IntakeTrack> {
  return (await sessionTracks(db, [sessionId]))?.get(sessionId) ?? 'child';
}
/** Ids of all adult-track files (few compared with the child track), for lists that label them. */
export async function adultSessionIds(db: SupabaseClient): Promise<Set<string>> {
  // Labelling only: if the track cannot be read the lists still load, with every file shown as a child file.
  try {
    const { data, error } = await db.from('intake_sessions').select('id').eq('track', 'adult').limit(5000);
    return new Set(error ? [] : (data ?? []).map((row: any) => row.id as string));
  } catch { return new Set(); }
}
