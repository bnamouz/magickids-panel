import { getSupabaseAdmin } from '@/lib/supabase';
type Ev = { ts: string; site: string; event: string; label: string | null; path: string; lang: string | null; visitor: string; session: string | null; referrer: string | null; utm_source: string | null; device: string | null; country: string | null; city: string | null };
const top = (m: Map<string, number>, n = 8) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);
const inc = (m: Map<string, number>, k: string | null | undefined, fallback = 'לא ידוע') => { const key = k || fallback; m.set(key, (m.get(key) ?? 0) + 1); };
export const LABEL_HE: Record<string, string> = {
  book_adhd_assessment: 'כפתור: תור לאבחון קשב', book_adhd_followup: 'כפתור: מעקב קשב', book_peds: 'כפתור: תור למרפאת ילדים', register: 'כפתור: פתיחת תיק',
  moxo: 'כפתור: MOXO', treatments: 'כפתור: טיפולים', reviews: 'כפתור: חוות דעת', whatsapp: 'וואטסאפ', phone: 'חיוג', email: 'מייל', abroad: 'כפתור: ליווי בחו״ל', classes: 'כפתור: חוגים',
  registered: 'פתחו תיק', payment_assessment: 'שלחו אישור תשלום (אבחון)', payment_followup: 'שלחו אישור תשלום (מעקב)',
  booked_adhd_assessment: 'קבעו תור לאבחון', booked_adhd_followup: 'קבעו תור למעקב', booked_pediatrics_assessment: 'קבעו תור למרפאת ילדים', booked_pediatrics_followup: 'קבעו תור למרפאת ילדים',
  fund_maccabi: 'בחרו מכבי', fund_clalit: 'בחרו כללית', fund_meuhedet: 'בחרו מאוחדת', fund_leumit: 'בחרו לאומית', fund_private: 'בחרו פרטי',
};
export const PATH_HE: Record<string, string> = {
  '/': 'דף הבית', '/index.html': 'דף הבית', '/adhd.html': 'קשב וריכוז', '/booking.html': 'קביעת תור (אתר)', '/treatments.html': 'טיפולים (אתר)', '/about.html': 'אודות',
  '/moxo-home.html': 'MOXO (אתר)', '/private-care.html': 'מסלול פרטי', '/child-development.html': 'התפתחות הילד', '/book/adhd': 'קביעת תור — קשב', '/book/pediatrics': 'קביעת תור — ילדים',
  '/register': 'פתיחת תיק', '/moxo': 'בקשת MOXO', '/treatments': 'בקשת טיפול', '/reviews': 'חוות דעת', '/abroad': 'ליווי בחו״ל', '/classes': 'חוגים',
};
export async function usageSummary(days: number) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const r = await getSupabaseAdmin().from('site_events').select('ts,site,event,label,path,lang,visitor,session,referrer,utm_source,device,country,city').gt('ts', since).order('ts', { ascending: false }).limit(20000);
  const ev = (r.data ?? []) as Ev[];
  const views = ev.filter(e => e.event === 'view');
  const visitors = new Set(views.map(e => e.visitor)), sessions = new Set(views.map(e => e.session ?? e.visitor));
  const byDay = new Map<string, { views: number; visitors: Set<string> }>();
  for (let i = days - 1; i >= 0; i--) byDay.set(new Date(Date.now() - i * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }), { views: 0, visitors: new Set() });
  for (const e of views) { const d = new Date(e.ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); const b = byDay.get(d); if (b) { b.views++; b.visitors.add(e.visitor); } }
  const pages = new Map<string, number>(), langs = new Map<string, number>(), sources = new Map<string, number>(), devices = new Map<string, number>(), cities = new Map<string, number>(), clicks = new Map<string, number>(), steps = new Map<string, number>();
  const firstBySession = new Map<string, Ev>();
  for (const e of [...views].reverse()) { const k = e.session ?? e.visitor; if (!firstBySession.has(k)) firstBySession.set(k, e); }
  for (const e of firstBySession.values()) inc(sources, e.utm_source ? `קמפיין: ${e.utm_source}` : e.referrer ? e.referrer.replace(/^(www|m|l|lm)\./, '') : null, 'ישיר / לא ידוע');
  for (const e of views) { inc(pages, `${e.site === 'public' ? 'אתר' : 'מערכת'} · ${PATH_HE[e.path] ?? e.path}`); inc(langs, e.lang === 'ar' ? 'ערבית' : e.lang === 'en' ? 'אנגלית' : 'עברית'); inc(devices, e.device === 'mobile' ? 'טלפון' : e.device === 'tablet' ? 'טאבלט' : 'מחשב'); inc(cities, e.city ? `${e.city}${e.country && e.country !== 'IL' ? ` (${e.country})` : ''}` : null); }
  for (const e of ev) { if (e.event === 'click') inc(clicks, LABEL_HE[e.label ?? ''] ?? e.label); if (e.event === 'step') inc(steps, e.label ?? ''); }
  const uniq = (pred: (e: Ev) => boolean) => new Set(ev.filter(pred).map(e => e.visitor)).size;
  const funnel = [
    { he: 'ביקרו באתר או במערכת', n: visitors.size },
    { he: 'הגיעו לעמוד קביעת תור', n: uniq(e => e.event === 'view' && e.path.startsWith('/book/')) },
    { he: 'בחרו קופת חולים', n: uniq(e => e.event === 'step' && (e.label ?? '').startsWith('fund_')) },
    { he: 'שלחו אישור תשלום', n: uniq(e => e.event === 'step' && (e.label ?? '').startsWith('payment_')) },
    { he: 'פתחו תיק (שאלונים)', n: uniq(e => e.event === 'step' && e.label === 'registered') },
    { he: 'קבעו תור', n: uniq(e => e.event === 'step' && (e.label ?? '').startsWith('booked_')) },
  ];
  return { days, total: ev.length, views: views.length, visitors: visitors.size, sessions: sessions.size,
    byDay: Array.from(byDay.entries()).map(([d, v]) => ({ day: d, views: v.views, visitors: v.visitors.size })),
    pages: top(pages, 12), langs: top(langs, 3), sources: top(sources), devices: top(devices, 3), cities: top(cities), clicks: top(clicks, 12),
    steps: top(steps, 12).map(([k, n]) => [LABEL_HE[k] ?? k, n] as [string, number]), funnel };
}
