import { getCalendarClient, getCalendarId } from '@/lib/google-calendar';
import { getPediatricsCalendarId } from '@/lib/pediatrics-calendar';

export const CALENDARS = { adhd: 'יומן מכון Magic Kids — קשב וריכוז', pediatrics: 'יומן מרפאת הילדים' } as const;
export type CalendarKey = keyof typeof CALENDARS;
export const calendarIdFor = (k: CalendarKey) => (k === 'adhd' ? getCalendarId() : getPediatricsCalendarId()).trim();
export const ROLE_HE: Record<string, string> = { owner: 'בעלים', writer: 'צפייה ועריכה', reader: 'צפייה בכל הפרטים', freeBusyReader: 'פנוי/תפוס בלבד' };

export async function calendarInfo(k: CalendarKey) {
  const id = calendarIdFor(k), cal = getCalendarClient();
  const meta = await cal.calendars.get({ calendarId: id }, { timeout: 10000 }).then(r => r.data).catch(() => null);
  let acl: { email: string; role: string }[] | null = null;
  try {
    const r = await cal.acl.list({ calendarId: id }, { timeout: 10000 });
    acl = (r.data.items ?? []).filter(x => x.scope?.type === 'user' || x.scope?.type === 'group').map(x => ({ email: x.scope?.value ?? '', role: x.role ?? '' }));
  } catch { acl = null; }   // the system account may lack permission to manage sharing
  return { key: k, label: CALENDARS[k], id, name: meta?.summary ?? null, acl, openUrl: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(id)}` };
}

export async function shareCalendar(k: CalendarKey, email: string, role: 'reader' | 'writer') {
  const id = calendarIdFor(k), cal = getCalendarClient();
  const list = await cal.acl.list({ calendarId: id }, { timeout: 10000 });
  const prior = (list.data.items ?? []).find(x => x.scope?.type === 'user' && x.scope?.value?.toLowerCase() === email);
  if (prior?.role === 'owner') return 'owner';
  if (prior?.id) { await cal.acl.patch({ calendarId: id, ruleId: prior.id, sendNotifications: true, requestBody: { role } }, { timeout: 10000 }); return 'updated'; }
  await cal.acl.insert({ calendarId: id, sendNotifications: true, requestBody: { role, scope: { type: 'user', value: email } } }, { timeout: 10000 });
  return 'granted';
}
