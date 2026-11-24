'use client';
import { useState } from 'react';

/** Opens the physician's referral a family attached to its MOXO request. The link is short-lived and every opening is recorded. */
export default function ReferralFile({ id, uploadedAt }: { id: string; uploadedAt: string | null }) {
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const when = uploadedAt ? new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }).format(new Date(uploadedAt)) : '';
  async function open() {
    setBusy(true); setFailed(false);
    // The tab is opened inside the click itself; a tab opened after the reply arrives is blocked on phones.
    const tab = window.open('', '_blank');
    try {
      const res = await fetch('/api/admin/moxo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'referral' }) });
      const data = await res.json();
      if (!res.ok || typeof data.url !== 'string') throw Error();
      if (tab) { tab.opener = null; tab.location.href = data.url; } else window.location.href = data.url;
    } catch { tab?.close(); setFailed(true); } finally { setBusy(false); }
  }
  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50 p-3">
      <p className="font-semibold">הפניה מהרופא: צורפה בטופס{when && <> · <bdi>{when}</bdi></>}</p>
      <p className="text-sm">לבקשה דרך מכבי: לוודא שההפניה בתוקף ולבדוק זכאות במכבי שלי.</p>
      <button type="button" disabled={busy} onClick={open} className="mt-2 underline font-semibold text-teal-900">{busy ? 'פותח…' : 'צפייה בהפניה'}</button>
      {failed && <p role="alert" className="text-red-700">לא ניתן לפתוח את הקובץ כרגע.</p>}
    </div>
  );
}
