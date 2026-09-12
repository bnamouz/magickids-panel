import { NextResponse } from 'next/server';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getCalendarClient, getCalendarId } from '@/lib/google-calendar';
import { getPediatricsCalendarId } from '@/lib/pediatrics-calendar';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export async function GET() {
  const staff = await getCurrentStaff();
  if (staff?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const checks = {
    enabled: process.env.PUBLIC_BOOKING_ENABLED === 'true',
    hashSecret: (process.env.BOOKING_HASH_SECRET?.length ?? 0) >= 32,
    credentials: !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    database: false,
    remindersEnabled: process.env.BOOKING_REMINDERS_ENABLED === 'true',
    whatsappConfigured: !!process.env.ULTRAMSG_INSTANCE_ID && !!process.env.ULTRAMSG_TOKEN,
    cronSecretConfigured: (process.env.CRON_SECRET?.length ?? 0) >= 32,
    treatmentQueue: false,
    distinctCalendars: false,
    calendars: {} as Record<string, { calendarId: string; name?: string; writable: boolean; accessible: boolean }>,
  };
  try {
    const db = await getSupabaseAdmin().from('website_bookings').select('id').limit(1);
    checks.database = !db.error;
    checks.treatmentQueue = !(await getSupabaseAdmin().from('treatment_requests').select('id').limit(1)).error;
    const ids = { pediatrics: getPediatricsCalendarId(), adhd: getCalendarId() };
    checks.distinctCalendars = ids.pediatrics !== ids.adhd && !Object.values(ids).includes('primary');
    const client = getCalendarClient();
    for (const [clinic, calendarId] of Object.entries(ids)) {
      checks.calendars[clinic] = { calendarId, writable: false, accessible: false };
      try {
        const result = await client.calendarList.get({ calendarId });
        checks.calendars[clinic] = { calendarId, name: result.data.summary ?? undefined, writable: ['writer', 'owner'].includes(result.data.accessRole ?? ''), accessible: true };
      } catch { /* A calendar must be accessible and have verified write access before activation. */ }
    }
  } catch { /* Return configuration booleans, never credential contents/errors. */ }
  return NextResponse.json(checks, { headers: { 'Cache-Control': 'no-store' } });
}
