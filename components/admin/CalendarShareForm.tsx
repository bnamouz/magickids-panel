'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const ERR: Record<string, string> = { no_permission: 'לחשבון המערכת אין הרשאה לשתף את היומן הזה. צריך לשתף אותו ידנית מתוך יומן גוגל של בעל היומן.', invalid_account: 'גוגל לא קיבל את כתובת המייל. בדקו שזו כתובת של חשבון גוגל.', invalid: 'בדקו את כתובת המייל.', forbidden: 'הפעולה זמינה למנהל בלבד.' };
const OK: Record<string, string> = { granted: 'היומן שותף. גוגל שלח הודעה למייל, והיומן יופיע ב"יומנים אחרים" ביומן גוגל.', updated: 'ההרשאה עודכנה.', owner: 'החשבון הזה כבר בעלים של היומן.' };

export default function CalendarShareForm({ calendar, defaultEmail }: { calendar: 'adhd' | 'pediatrics'; defaultEmail: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail), [role, setRole] = useState<'reader' | 'writer'>('reader');
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  async function share() {
    if (!confirm(`לשתף את היומן עם ${email}? בעל החשבון יראה את כל פרטי התורים, כולל שמות ומספרי טלפון.`)) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/admin/google-calendars', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calendar, email, role }) });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? OK[d.result] ?? 'בוצע.' : ERR[d.error] ?? 'השיתוף לא הצליח כרגע. נסו שוב.');
      if (r.ok) router.refresh();
    } catch { setMsg('השיתוף לא הצליח כרגע. נסו שוב.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2 rounded-lg bg-slate-50 p-3">
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 flex-1 basis-64 text-sm font-bold">חשבון גוגל לשיתוף<input className="mt-1 w-full rounded border p-2 font-normal" dir="ltr" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label className="text-sm font-bold">הרשאה<select className="mt-1 block rounded border p-2 font-normal" value={role} onChange={e => setRole(e.target.value as 'reader' | 'writer')}><option value="reader">צפייה בכל הפרטים</option><option value="writer">צפייה ועריכה</option></select></label>
      <button className="btn-primary" disabled={busy || !email} onClick={share}>{busy ? 'משתף…' : 'שיתוף היומן'}</button>
    </div>
    {msg && <p className="text-sm font-bold text-teal-900" role="status">{msg}</p>}
  </div>;
}
