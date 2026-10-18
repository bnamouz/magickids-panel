import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { secretOk } from '@/lib/clinic-patients/campaign';
import { getCalendarClient, getCalendarId } from '@/lib/google-calendar';
import { getPediatricsCalendarId } from '@/lib/pediatrics-calendar';
import { appointmentTitle } from '@/lib/calendar-consistency';
import { modernizeTitle } from '@/lib/calendar-title';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
/** Internal maintenance: rename upcoming system events to "<name> · <visit kind>". Idempotent. */
export async function POST(req: NextRequest) {
  if (!secretOk(req.headers.get('x-campaign-secret'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const cal = getCalendarClient(), db = getSupabaseAdmin();
  const out: { calendar: string; renamed: number; skipped: number; samples: string[] }[] = [];
  for (const calendarId of Array.from(new Set([getCalendarId(), getPediatricsCalendarId()]))) {
    let renamed = 0, skipped = 0; const samples: string[] = []; let pageToken: string | undefined;
    do {
      const r = await cal.events.list({ calendarId, timeMin: new Date(Date.now() - 864e5).toISOString(), timeMax: new Date(Date.now() + 180 * 864e5).toISOString(), singleEvents: true, showDeleted: false, maxResults: 2500, pageToken, fields: 'nextPageToken,items(id,summary,extendedProperties)' }, { timeout: 20000 });
      for (const e of r.data.items ?? []) {
        const priv = e.extendedProperties?.private ?? {};
        let next = modernizeTitle(e.summary);
        if (!next && priv.appointmentId && (e.summary ?? '').startsWith('פגישה במכון')) {
          const a = await db.from('appointments').select('patient_id,appointment_type').eq('id', priv.appointmentId).maybeSingle();
          if (a.data) { const t = await appointmentTitle(a.data.patient_id, a.data.appointment_type); if (t !== e.summary) next = t; }
        }
        if (!next || !e.id) { skipped++; continue; }
        if (!dry) await cal.events.patch({ calendarId, eventId: e.id, sendUpdates: 'none', requestBody: { summary: next } }, { timeout: 10000 });
        renamed++; if (samples.length < 3) samples.push(next.replace(/^(\S+)\s\S+/, '$1 ◌'));
      }
      pageToken = r.data.nextPageToken ?? undefined;
    } while (pageToken);
    out.push({ calendar: calendarId.slice(0, 10), renamed, skipped, samples });
  }
  return NextResponse.json({ dry, calendars: out });
}
