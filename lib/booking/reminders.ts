import { getSupabaseAdmin } from '@/lib/supabase';
import { getCalendarClient } from '@/lib/google-calendar';
import { notifyOnce } from '@/lib/moxo/notification';
import { cancellationToken } from './server';
import { TIME_ZONE } from './schedule';
export async function sendDueReminders(now = new Date()) {
  if (process.env.BOOKING_REMINDERS_ENABLED !== 'true' || !process.env.ULTRAMSG_INSTANCE_ID || !process.env.ULTRAMSG_TOKEN) throw new Error('not_configured');
  const db = getSupabaseAdmin();
  // A minutely scheduler sends during the 29–30 minute window. Never catch up
  // old reminders after an outage or send after the appointment has started.
  const rows = await db.from('website_bookings').select('id,starts_at,calendar_id,event_id')
    .eq('clinic', 'pediatrics').eq('status', 'confirmed')
    .gt('starts_at', new Date(now.getTime() + 29 * 60000).toISOString())
    .lte('starts_at', new Date(now.getTime() + 30 * 60000).toISOString()).limit(20);
  if (rows.error) throw new Error('unavailable');
  let accepted = 0, skipped = 0;
  for (const row of rows.data ?? []) {
    try {
      const event = (await getCalendarClient().events.get({ calendarId: row.calendar_id, eventId: row.event_id })).data;
      const p = event.extendedProperties?.private;
      if (event.status === 'cancelled' || p?.websiteBooking !== row.id || p?.clinic !== 'pediatrics' || p?.reminderConsent !== 'true'
        || !/^\+[1-9]\d{6,14}$/.test(p?.reminderPhone ?? '') || Date.parse(event.start?.dateTime ?? '') !== Date.parse(row.starts_at)) { skipped++; continue; }
      const current = await db.from('website_bookings').select('status').eq('id', row.id).single();
      if (current.error || current.data?.status !== 'confirmed') { skipped++; continue; }
      const lang = p.language === 'he' || p.language === 'en' ? p.language : 'ar';
      const when = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : `${lang}-IL`, { timeZone: TIME_ZONE, dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.starts_at));
      const link = `https://app.magickidsinstitute.com/book/cancel?lang=${lang}#id=${row.id}&token=${cancellationToken(row.id)}`;
      const message = lang === 'he' ? `תזכורת: התור שלך במרפאת הילדים בעוד כחצי שעה, ${when} (שעון ישראל). תופיק זיאד 21, שפרעם. לביטול התור: ${link}`
        : lang === 'ar' ? `تذكير: موعدكم في عيادة الأطفال بعد حوالي نصف ساعة، ${when} (توقيت إسرائيل). توفيق زياد 21، شفاعمرو. لإلغاء الموعد: ${link}`
        : `Reminder: your pediatrics visit is in about 30 minutes, ${when} (Israel time). 21 Tawfiq Ziad, Shefa-Amr. Cancel: ${link}`;
      const state = await notifyOnce(`pediatrics-reminder:${row.id}`, p.reminderPhone!, message);
      if (state === 'accepted') accepted++; else skipped++;
    } catch { skipped++; } // Do not log patient information or provider errors.
  }
  return { accepted, skipped };
}
