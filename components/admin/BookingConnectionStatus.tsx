'use client';

import { useState } from 'react';

type Checks = {
  enabled: boolean;
  hashSecret: boolean;
  credentials: boolean;
  database: boolean;
  distinctCalendars: boolean;
  calendars: Record<string, { writable: boolean; accessible: boolean }>;
};

export default function BookingConnectionStatus() {
  const [checks, setChecks] = useState<Checks | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function check() {
    setLoading(true); setError(''); setChecks(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('/api/admin/booking-status', { cache: 'no-store', signal: controller.signal });
      if (response.status === 403) throw new Error('בדיקת החיבור זמינה למנהל המערכת בלבד. יש להתחבר בחשבון אדמין.');
      if (!response.ok) throw new Error('לא ניתן לבדוק את החיבור כרגע. אין אישור שההזמנה פעילה.');
      const data = await response.json();
      if (!data || typeof data.enabled !== 'boolean' || !data.calendars) throw new Error('התקבלה תשובה לא תקינה. נסו שוב.');
      setChecks(data);
    } catch (e) {
      setError(e instanceof Error && e.name !== 'AbortError' ? e.message : 'הבדיקה לא הושלמה בזמן. נסו שוב.');
    } finally { clearTimeout(timer); setLoading(false); }
  }
  const rows: [string, boolean][] = checks ? [
    ['הזמנה עצמית מופעלת', checks.enabled],
    ['הגנת הזמנות מוגדרת', checks.hashSecret],
    ['פרטי חיבור Google מוגדרים', checks.credentials],
    ['טבלת ההזמנות נגישה', checks.database],
    ['הוגדרו שני יומנים נפרדים', checks.distinctCalendars],
    ['הרשאת כתיבה ליומן מרפאת הילדים', checks.calendars.pediatrics?.accessible === true && checks.calendars.pediatrics?.writable === true],
    ['הרשאת כתיבה ליומן המכון', checks.calendars.adhd?.accessible === true && checks.calendars.adhd?.writable === true],
  ] : [];
  return (
    <section className="rounded-lg border border-slate-200 p-4 max-w-lg text-sm" aria-label="מצב חיבור ההזמנות">
      <button type="button" onClick={check} disabled={loading} className="rounded bg-teal-700 px-4 py-2 text-white disabled:opacity-50">
        {loading ? 'בודק חיבור…' : 'בדיקת חיבור ההזמנות'}
      </button>
      <div aria-live="polite">
        {!checks && !error && <p className="mt-2 text-slate-600">מצב החיבור טרם אומת. לחצו לבדיקה עדכנית.</p>}
        {error && <p className="mt-2 text-red-700">{error}</p>}
        {checks && <>
          <p className="mt-3 font-semibold">{rows.every(([, ok]) => ok) ? 'בדיקות ההגדרות והרשאות היומנים עברו.' : 'ההזמנה העצמית עדיין אינה מוכנה — נדרשת השלמת הסעיפים הבאים.'}</p>
          <ul className="mt-2 space-y-1">{rows.map(([label, ok]) => <li key={label} className={ok ? 'text-teal-800' : 'text-red-700'}>{ok ? '✓' : '✕'} {label}{ok ? '' : ' — חסר או לא אומת'}</li>)}</ul>
          <p className="mt-3 text-slate-600">זו בדיקת גישה והגדרות בלבד. לא נוצר תור ולא נשלחה הודעה. הצלחת הבדיקה אינה אישור לסנכרון מלא או למסירת WhatsApp.</p>
        </>}
      </div>
      <p className="mt-3"><a className="underline" href="/admin/moxo">ניהול בקשות MOXO ואישור מועדים</a></p>
    </section>
  );
}
