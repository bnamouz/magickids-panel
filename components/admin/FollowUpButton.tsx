'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function FollowUpButton({ callId, done = true }: { callId: string; done?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function act() {
    setBusy(true); setError('');
    try {
      const r = await fetch(`/api/admin/calls/${callId}/follow-up`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done }),
      });
      if (!r.ok) throw Error((await r.json().catch(() => ({}))).error || 'הפעולה נכשלה');
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'הפעולה נכשלה'); }
    finally { setBusy(false); }
  }
  return <span className="inline-flex flex-col">
    <button type="button" disabled={busy} onClick={act}
      className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
      {busy ? 'שומר…' : done ? 'טופל ✓' : 'החזרה לטיפול'}
    </button>
    {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
  </span>;
}
