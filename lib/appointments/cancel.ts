import { getSupabaseAdmin } from '@/lib/supabase';
import { getCalendarClient, getCalendarId } from '@/lib/google-calendar';

export type CancelOutcome = { ok: true; already?: boolean } | { ok: false; error: 'not_found' | 'sync_pending' | 'calendar_pending' };

/** Cancels a panel appointment: removes the Google event, releases any mirrored website booking, marks the row cancelled.
 *  Shared by the admin button and the secured maintenance route. */
export async function cancelAppointment(appointmentId: string, reason: string | null, actor: { id: string; type: 'staff' | 'system' }): Promise<CancelOutcome> {
  const db = getSupabaseAdmin();
  const found = await db.from('appointments').select('*').eq('id', appointmentId).single();
  if (found.error || !found.data) return { ok: false, error: 'not_found' };
  const r = found.data;
  if (r.status === 'cancelled') return { ok: true, already: true };
  const claim = await db.from('appointments').update({ calendar_sync: 'cancelling' }).eq('id', r.id).neq('calendar_sync', 'syncing').select('id').maybeSingle();
  if (claim.error || !claim.data) return { ok: false, error: 'sync_pending' };
  try {
    if (r.gcal_event_id) {
      const calendarId = r.gcal_calendar_id || getCalendarId();
      try { await getCalendarClient().events.delete({ calendarId, eventId: r.gcal_event_id, sendUpdates: 'none' }); }
      catch (e: any) { if (![404, 410].includes(Number(e.code ?? e.response?.status))) throw e; }
      const released = await db.from('website_bookings').update({ status: 'released', updated_at: new Date().toISOString() }).eq('event_id', r.gcal_event_id).eq('calendar_id', calendarId);
      if (released.error) throw released.error;
    }
    const updated = await db.from('appointments').update({ status: 'cancelled', calendar_sync: 'synced', cancelled_reason: reason || null, cancelled_at: new Date().toISOString() }).eq('id', r.id);
    if (updated.error) throw updated.error;
    await db.from('audit_log').insert({ actor_id: actor.type === 'staff' ? actor.id : null, actor_type: actor.type, action: 'appointment_cancelled', entity_type: 'appointment', entity_id: r.id, metadata: { reason: reason || null, scheduled_at: r.scheduled_at, type: r.appointment_type, via: actor.type === 'staff' ? 'admin' : actor.id } }).then(() => null, () => null);
    return { ok: true };
  } catch { return { ok: false, error: 'calendar_pending' }; }
}
