'use client';
import { useState } from 'react';
import { confirmationLabels, confirmationMessage, type ConfirmationLanguage, type ConfirmationResult } from '@/lib/appointments/confirmation-copy';

export type NoticeOptions = {
  email: boolean; whatsapp: boolean; language: ConfirmationLanguage; consentConfirmed: boolean;
};
export const initialNotice: NoticeOptions = { email: true, whatsapp: true, language: 'he', consentConfirmed: false };

export function ConfirmationFields({ value, onChange, email, phone, start, location, disabled = false }: {
  value: NoticeOptions; onChange: (v: NoticeOptions) => void; email: string; phone: string;
  start?: string; location?: string | null; disabled?: boolean;
}) {
  return <fieldset disabled={disabled} className="border border-slate-200 rounded-lg p-3 space-y-3 text-sm">
    <legend className="font-semibold px-1">אישור להורה במייל ובוואטסאפ</legend>
    <p>נמען מתוך התיק: <bdi>{email || 'חסר מייל'}</bdi> · <bdi>{phone || 'חסר טלפון'}</bdi></p>
    <p className="text-slate-500">השליחה תתאפשר רק אחרי הפעלת השירות ואימות הסנכרון ליומן. פרטים חסרים לא יושלמו אוטומטית.</p>
    <div className="flex flex-wrap gap-4">
      <label><input type="checkbox" checked={value.email} onChange={e => onChange({ ...value, email: e.target.checked })} /> מייל</label>
      <label><input type="checkbox" checked={value.whatsapp} onChange={e => onChange({ ...value, whatsapp: e.target.checked })} /> וואטסאפ</label>
      <label>שפת ההודעה <select aria-label="שפת הודעת האישור" className="border rounded p-1" value={value.language} onChange={e => onChange({ ...value, language: e.target.value as ConfirmationLanguage })}><option value="he">עברית</option><option value="ar">العربية</option></select></label>
    </div>
    {start && Number.isFinite(Date.parse(start)) && <pre className="whitespace-pre-wrap font-sans bg-slate-50 rounded p-3" dir="rtl">{confirmationMessage(start, location ?? null, value.language)}</pre>}
    {(value.email || value.whatsapp) && <label className="flex items-start gap-2">
      <input type="checkbox" className="mt-1" checked={value.consentConfirmed} onChange={e => onChange({ ...value, consentConfirmed: e.target.checked })} />
      <span>בדקתי את פרטי ההורה ואת הנוסח, וקיימת הסכמה לקבלת עדכוני תור בערוצים שסומנו, כולל וואטסאפ אם נבחר.</span>
    </label>}
  </fieldset>;
}

export function ConfirmationStatus({ result }: { result: ConfirmationResult }) {
  return <div role="status" className="rounded-lg border p-3 text-sm space-y-2">
    <p>מייל: {confirmationLabels[result.email] ?? confirmationLabels.unknown}</p>
    <p>וואטסאפ: {confirmationLabels[result.whatsapp] ?? confirmationLabels.unknown}</p>
  </div>;
}

export default function AppointmentConfirmation({ id, email, phone, start, location }: {
  id: string; email: string; phone: string; start: string; location: string | null;
}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<NoticeOptions>({ ...initialNotice });
  const [result, setResult] = useState<ConfirmationResult | null>(null);
  const [error, setError] = useState('');
  async function status() {
    setOpen(true); setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/appointments/${id}/confirmation`, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      setResult(await response.json());
    } catch { setError('לא ניתן לבדוק מצב שליחה. אין לשלוח שוב לפני בירור.'); }
    finally { setBusy(false); }
  }
  async function send() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/appointments/${id}/confirmation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...options, expectedEmail: email, expectedPhone: phone, expectedStart: start, expectedLocation: location ?? '' }),
      });
      if (!response.ok) throw new Error();
      setResult(await response.json());
    } catch { setError('התוצאה אינה ודאית. בדקו מצב לפני פעולה נוספת; אין ליצור תור חדש.'); }
    finally { setBusy(false); }
  }
  return <div className="mt-2 space-y-3">
    <button type="button" onClick={status} disabled={busy} className="underline text-sm text-[#01696f]">מצב אישור במייל ובוואטסאפ</button>
    {open && <>
      <ConfirmationFields value={options} onChange={setOptions} email={email} phone={phone} start={start} location={location} disabled={busy} />
      {result && <ConfirmationStatus result={result} />}
      {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
      <button type="button" disabled={busy || !!error || !options.consentConfirmed || (!options.email && !options.whatsapp)}
        onClick={send} className="rounded bg-[#01696f] text-white p-2 text-sm disabled:opacity-50">
        {busy ? 'בודק…' : 'שליחת אישור בערוצים שנבחרו'}
      </button>
      <p className="text-xs text-slate-500">ערוץ שכבר נשלח או שמצבו אינו ודאי לא נשלח שוב. אין כאן הודעת שינוי או ביטול תור.</p>
    </>}
  </div>;
}
