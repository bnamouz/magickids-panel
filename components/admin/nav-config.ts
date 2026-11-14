export type NavFolder = { id: string; title: string; items: [href: string, label: string][] };
/** Five work folders. Every staff destination appears in exactly one folder. */
export const NAV_FOLDERS: NavFolder[] = [
  { id: 'calendar', title: 'יומן ובקשות', items: [
    ['/admin/pediatrics-calendar', 'יומן ילדים ובקשות לרופא'],
    ['/admin/appointments', 'יומן פגישות המכון'],
    ['/admin/clinic-hours', 'סגירת יומן ושינוי שעות'],
    ['/admin/adhd-requests', 'בקשות לרופא — קשב'],
    ['/admin/moxo', 'בקשות MOXO'],
    ['/admin/treatments', 'פניות וטיפולים'],
    ['/admin/therapy', 'יומני בקשות למטפלים'],
  ] },
  { id: 'patients', title: 'מטופלים', items: [
    ['/admin/clinic-patients', 'מטופלי המרפאה'],
    ['/admin/intake', 'קליטה וזימון לקשב'],
    ['/admin/sessions', 'תיקי מטופלים'],
    ['/admin/adhd-payments', 'אימות תשלומים לקשב'],
  ] },
  { id: 'communication', title: 'תקשורת', items: [
    ['/admin/calls', 'שיחות שרה'],
    ['/admin/personal/calls', 'שיחות נור'],
    ['/admin/secretaries', 'המזכירות והתחייבויות מכבי'],
  ] },
  { id: 'marketing', title: 'שיווק ונתוני אתר', items: [
    ['/admin/leads', 'לידים ושימוש באתר'],
    ['/admin/reviews', 'חוות דעת ותמונות'],
    ['/admin/classes', 'חוגים ומתעניינים'],
    ['/admin/development', 'התפתחות הילד'],
    ['/admin/abroad', 'ליווי ילדים בחו״ל'],
  ] },
  { id: 'management', title: 'ניהול', items: [
    ['/admin/therapists', 'מטפלים ושעות עבודה'],
    ['/admin/recruitment', 'גיוס מטפלים'],
    ['/admin/google-calendars', 'יומני גוגל — שיתוף'],
    ['/admin/system-health', 'בריאות המערכת'],
  ] },
];
export const DASHBOARD_HREF = '/admin/dashboard';
export const DASHBOARD_LABEL = 'סקירה יומית';
export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/');
}
/** Folder and destination that own the given path, if any. */
export function locatePath(pathname: string) {
  for (const folder of NAV_FOLDERS) {
    const item = folder.items.find(([href]) => isActivePath(pathname, href));
    if (item) return { folder, href: item[0], label: item[1] };
  }
  return null;
}
