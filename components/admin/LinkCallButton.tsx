'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Link (caseId) or unlink (null) a voice call. */
export default function LinkCallButton({ callId, caseId, label }: { callId: string; caseId: string | null; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function act() {
    if (!caseId && !window.confirm('לנתק את השיחה מהתיק? השיחה עצמה תישמר ביומן השיחות.')) return;
    setBusy(true); setError('');
    try {
      const r = await fetch(`/api/admin/calls/${callId}/link`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ case_id: caseId }),
      });
      if (!r.ok) throw Error((await r.json().catch(() => ({}))).error || 'הפעולה נכשלה');
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'הפעולה נכשלה'); }
    finally { setBusy(false); }
  }
  return <span className="inline-flex flex-col">
    <button type="button" disabled={busy} onClick={act}
      className="rounded border border-teal-200 px-2 py-1 text-xs font-semibold text-teal-800 disabled:opacity-50">
      {busy ? 'שומר…' : label}
    </button>
    {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
  </span>;
}
