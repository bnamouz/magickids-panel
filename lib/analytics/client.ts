'use client';
/** Cookieless first-party usage tracking for the public pages of the panel. */
const ENDPOINT = '/api/track';
const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => (b % 36).toString(36)).join('');
function id(store: Storage, key: string) { try { let v = store.getItem(key); if (!v) { v = rand(); store.setItem(key, v); } return v; } catch { return rand(); } }
function device() { const w = window.innerWidth; return w < 768 ? 'mobile' : w < 1100 ? 'tablet' : 'desktop'; }
function refHost() { try { const h = document.referrer ? new URL(document.referrer).host : ''; return h && h !== location.host ? h : null; } catch { return null; } }
function utm() {
  try {
    const saved = sessionStorage.getItem('mk_utm'); if (saved) return JSON.parse(saved);
    const p = new URLSearchParams(location.search);
    const u = { utm_source: p.get('utm_source'), utm_medium: p.get('utm_medium'), utm_campaign: p.get('utm_campaign') };
    if (u.utm_source || u.utm_medium || u.utm_campaign) sessionStorage.setItem('mk_utm', JSON.stringify(u));
    return u;
  } catch { return {}; }
}
/** Replace ids/tokens in dynamic routes so paths stay aggregatable and never carry secrets. */
export function cleanPath(path: string) {
  return path.split('/').map(seg => (/^[0-9a-f-]{20,}$/i.test(seg) || /^[A-Za-z0-9_-]{24,}$/.test(seg) ? ':id' : seg)).join('/').slice(0, 200);
}
export function track(event: 'view' | 'click' | 'step', label?: string | null, path?: string) {
  if (typeof window === 'undefined') return;
  try {
    if ((navigator as any).webdriver) return;
    const lang = document.documentElement.lang; const l = lang === 'ar' || lang === 'en' ? lang : 'he';
    const body = JSON.stringify({ site: 'app', event, label: label ?? null, path: cleanPath(path ?? location.pathname), lang: l,
      visitor: id(localStorage, 'mk_v'), session: id(sessionStorage, 'mk_s'), referrer: refHost(), ...utm(), device: device() });
    if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }));
    else fetch(ENDPOINT, { method: 'POST', body, keepalive: true }).catch(() => {});
  } catch { /* analytics must never break the page */ }
}
