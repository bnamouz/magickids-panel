'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
/** Per-appointment cancel control for staff; asks for confirmation inline, then refreshes the calendar. */
export default function CancelEvent({ eventId, label }: { eventId: string; label: string }) {
  const router = useRouter();
  const [step, setStep] = useState<'idle' | 'confirm' | 'busy' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  async function run() {
    setStep('busy'); setError('');
    try {
      const r = await fetch('/api/admin/pediatrics-calendar/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error === 'calendar_unavailable' ? 'יומן גוגל לא זמין כרגע – נסו שוב' : d.error === 'all_day' ? 'אירוע לכל היום מבטלים ביומן גוגל' : 'הביטול נכשל – נסו שוב'); setStep('error'); return; }
      setStep('done'); router.refresh();
    } catch { setError('הביטול נכשל – נסו שוב'); setStep('error'); }
  }
  if (step === 'done') return <span className="text-xs text-emerald-700">התור בוטל והשעה שוחררה</span>;
  if (step === 'confirm' || step === 'busy') return <span className="inline-flex flex-wrap items-center gap-2 text-xs"><span>לבטל את התור של {label}?</span><button type="button" disabled={step === 'busy'} onClick={run} className="rounded bg-rose-700 text-white px-2 py-1 disabled:opacity-50">{step === 'busy' ? 'מבטל…' : 'כן, לבטל'}</button><button type="button" disabled={step === 'busy'} onClick={() => setStep('idle')} className="rounded border px-2 py-1">לא</button></span>;
  return <span className="inline-flex items-center gap-2 text-xs">{step === 'error' && <span className="text-rose-700">{error}</span>}<button type="button" onClick={() => setStep('confirm')} className="rounded border border-rose-300 text-rose-700 px-2 py-1 hover:bg-rose-50">ביטול תור</button></span>;
}
