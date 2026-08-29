'use client';

import { useState } from 'react';
import { PhoneOutgoing, Loader2, X } from 'lucide-react';

interface Props {
  compact?: boolean;
}

export default function OutboundCallButton({ compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function initiateCall(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const resp = await fetch('/api/nour/outbound-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_number: phone,
          patient_name: name || undefined,
          purpose: purpose || undefined,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setResult({ ok: true, msg: data.message || 'השיחה יוזמה בהצלחה' });
        setTimeout(() => {
          setOpen(false);
          setResult(null);
          setPhone('');
          setName('');
          setPurpose('');
        }, 3000);
      } else {
        setResult({ ok: false, msg: data.error || 'שגיאה' });
      }
    } catch (err) {
      setResult({ ok: false, msg: String(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          compact
            ? 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition'
            : 'inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition shadow-sm'
        }
      >
        <PhoneOutgoing className="w-4 h-4" />
        התקשר עם נור
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !loading && setOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900">נור תתקשר</h2>
              <button
                onClick={() => !loading && setOpen(false)}
                className="p-1 rounded hover:bg-slate-100"
                disabled={loading}
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              נור תתקשר מיד אל המספר. השיחה תוקלט ותופיע כאן בסיום.
            </p>

            <form onSubmit={initiateCall} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  מספר טלפון *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="050-123-4567 או +972501234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  disabled={loading}
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  שם המטופל (אופציונלי)
                </label>
                <input
                  type="text"
                  placeholder="ג'רות ג'מאל"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  מטרת השיחה (אופציונלי)
                </label>
                <textarea
                  placeholder="הודעה לגבי דחיית תור, אישור פגישה, וכו'..."
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
                  disabled={loading}
                />
              </div>

              {result && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    result.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                  }`}
                >
                  {result.msg}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={loading || !phone}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      מתקשרת...
                    </>
                  ) : (
                    <>
                      <PhoneOutgoing className="w-4 h-4" />
                      התקשר
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => !loading && setOpen(false)}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition disabled:opacity-50"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
