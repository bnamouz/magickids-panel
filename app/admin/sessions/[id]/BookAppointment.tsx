'use client';

import { useState } from 'react';
import { CalendarPlus, X, Loader2, Check, AlertCircle } from 'lucide-react';

interface Props {
  sessionId: string;
  childName: string;
}

const APPOINTMENT_TYPES = [
  { value: 'assessment', label: 'אבחון ADHD', duration: 60 },
  { value: 'followup', label: 'מעקב', duration: 30 },
];

export default function BookAppointment({ sessionId, childName }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('assessment');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [location, setLocation] = useState('מכון Magic Kids, שפרעם');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const duration = APPOINTMENT_TYPES.find((t) => t.value === type)?.duration ?? 60;

  // Returns "+03:00" for IDT (summer) or "+02:00" for IST (winter)
  function getIsraelOffset(dateStr: string): string {
    // Use Intl to get the offset for the given date in Asia/Jerusalem
    const d = new Date(`${dateStr}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem',
      timeZoneName: 'shortOffset',
    }).formatToParts(d);
    const tz = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+3';
    const match = tz.match(/GMT([+-]\d+)/);
    if (match) {
      const hours = parseInt(match[1], 10);
      const sign = hours >= 0 ? '+' : '-';
      const abs = Math.abs(hours).toString().padStart(2, '0');
      return `${sign}${abs}:00`;
    }
    return '+03:00'; // fallback
  }

  async function submit() {
    setError(null);
    setSuccess(null);

    if (!date || !time) {
      setError('חובה לבחור תאריך ושעה');
      return;
    }

    // Build ISO with explicit Asia/Jerusalem intent (avoid browser timezone drift)
    // Israel is UTC+3 in summer (IDT) and UTC+2 in winter (IST)
    const israelOffset = getIsraelOffset(date);
    const scheduledAt = `${date}T${time}:00${israelOffset}`;

    setLoading(true);
    try {
      const res = await fetch('/api/admin/appointments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          appointment_type: type,
          scheduled_at: scheduledAt,
          duration_minutes: duration,
          location: location || null,
          notes: notes || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.conflicts) {
          setError(
            `השעה תפוסה ביומן. סיבה: ${data.conflicts
              .map((c: any) => c.summary)
              .join(', ')}`
          );
        } else {
          setError(data.error || 'שגיאה ביצירת פגישה');
        }
        return;
      }

      setSuccess(
        data.warning
          ? `הפגישה נשמרה. ${data.warning}`
          : 'הפגישה נקבעה בהצלחה ונוספה ליומן'
      );

      // Refresh page after 1.5s to show new appointment
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (e: any) {
      setError(e.message || 'שגיאת רשת');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#01696f] text-white text-sm font-semibold hover:bg-[#0C4E54] transition"
      >
        <CalendarPlus size={16} /> קבע פגישה
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !loading && setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-slate-800">
                קביעת פגישה - {childName}
              </h3>
              <button
                onClick={() => !loading && setOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  סוג פגישה
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  {APPOINTMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label} ({t.duration} דקות)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    תאריך
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    שעה
                  </label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  מיקום
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  הערות (לא חובה)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 text-red-800 rounded-lg text-sm">
                  <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="flex items-start gap-2 p-3 bg-green-50 text-green-800 rounded-lg text-sm">
                  <Check size={16} className="mt-0.5 flex-shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={submit}
                  disabled={loading || !!success}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#01696f] text-white rounded-lg font-semibold text-sm hover:bg-[#0C4E54] transition disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> שומר...
                    </>
                  ) : (
                    <>
                      <CalendarPlus size={16} /> קבע פגישה
                    </>
                  )}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  disabled={loading}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 transition"
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
