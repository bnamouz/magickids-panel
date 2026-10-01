'use client';

import { useState, useEffect } from 'react';
import { candidateSlots, localParts, isAssessmentSlot, FOLLOWUP_QUARTERS } from '@/lib/booking/schedule';
import { CalendarPlus, X, Loader2, Check, AlertCircle } from 'lucide-react';

interface Props {
  sessionId: string;
  childName: string;
  assessmentReady: boolean;
}

// Follow-ups (מעקב) are quarter-hour slots inside the same Wednesday
// 16:00–20:00 ADHD window as assessments, so up to four can share one hour.
const FOLLOWUP_HOURS = ['16:00', '17:00', '18:00', '19:00'];
const APPOINTMENT_TYPES = [
  { value: 'assessment', label: 'אבחון ADHD', duration: 60 },
  { value: 'followup', label: 'מעקב', duration: 15 },
];

type QuarterSlot = { minute: number; time: string; available: boolean; takenBy: string | null };

export default function BookAppointment({ sessionId, childName, assessmentReady }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(assessmentReady ? 'assessment' : 'followup');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('16:00');
  const [quarter, setQuarter] = useState<number | null>(null);
  const [quarters, setQuarters] = useState<QuarterSlot[] | null>(null);
  const [quartersLoading, setQuartersLoading] = useState(false);
  const [location, setLocation] = useState('מכון Magic Kids, שפרעם');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const duration = APPOINTMENT_TYPES.find((t) => t.value === type)?.duration ?? 60;
  const wednesdayDates = [...new Set(candidateSlots('adhd').map((iso) => localParts(new Date(iso)).date))];

  // Load quarter-hour availability for the chosen follow-up date+hour.
  useEffect(() => {
    if (type !== 'followup' || !date || !time) { setQuarters(null); return; }
    const hour = Number(time.split(':')[0]);
    let cancelled = false;
    setQuartersLoading(true);
    setQuarter(null);
    fetch(`/api/admin/appointments/followup-slots?date=${date}&hour=${hour}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.quarters)) {
          setQuarters(data.quarters);
          const firstFree = data.quarters.find((q: QuarterSlot) => q.available);
          setQuarter(firstFree ? firstFree.minute : null);
        } else {
          setQuarters(null);
        }
      })
      .catch(() => { if (!cancelled) setQuarters(null); })
      .finally(() => { if (!cancelled) setQuartersLoading(false); });
    return () => { cancelled = true; };
  }, [type, date, time]);

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
    if (type === 'followup' && quarter === null) {
      setError('חובה לבחור רבע שעה פנוי בתוך השעה שנבחרה');
      return;
    }

    // Build ISO with explicit Asia/Jerusalem intent (avoid browser timezone drift)
    // Israel is UTC+3 in summer (IDT) and UTC+2 in winter (IST)
    const israelOffset = getIsraelOffset(date);
    const effectiveTime = type === 'followup'
      ? `${time.split(':')[0]}:${String(quarter).padStart(2, '0')}`
      : time;
    const scheduledAt = `${date}T${effectiveTime}:00${israelOffset}`;

    if (type === 'assessment' && !isAssessmentSlot(scheduledAt)) { setError('יש לבחור יום רביעי בשעה 16:00, 17:00, 18:00 או 19:00. משך האבחון שעה.'); return; }
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
        } else if (res.status === 409 && type === 'followup') {
          setError((data.error || 'הרבע תפוס') + ' נסה/י לבחור רבע שעה אחר בתוך השעה, או שעה אחרת.');
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
                  onChange={(e) => { setType(e.target.value); setDate(''); setTime('16:00'); setQuarter(null); }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  {APPOINTMENT_TYPES.filter(item => assessmentReady || item.value !== 'assessment').map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label} ({t.duration} דקות)
                    </option>
                  ))}
                </select>
              </div>

              {type === 'followup' && (
                <p className="text-xs text-slate-500 -mt-2">מעקב מתקיים בימי רביעי בין 16:00–20:00. כל שעה מתחלקת לארבעה רבעי שעה, כך שעד 4 מטופלים יכולים להירשם לאותה שעה.</p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    תאריך
                  </label>
                  <select aria-label="יום רביעי" value={date} onChange={e=>setDate(e.target.value)} className="w-full border rounded-lg p-2"><option value="">בחירת יום רביעי</option>{wednesdayDates.map(day=><option key={day} value={day}>{day}</option>)}</select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    שעה
                  </label>
                  <select aria-label="שעה" value={time} onChange={e=>setTime(e.target.value)} className="w-full border rounded-lg p-2">{(type === 'assessment' ? ['16:00','17:00','18:00','19:00'] : FOLLOWUP_HOURS).map(hour=><option key={hour}>{hour}</option>)}</select>
                </div>
              </div>

              {type === 'followup' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    רבע שעה
                  </label>
                  {quartersLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500 py-2"><Loader2 size={14} className="animate-spin" /> בודק זמינות...</div>
                  ) : quarters && quarters.every(q => !q.available) ? (
                    <p className="text-sm text-red-700">כל ארבעת רבעי השעה תפוסים. בחר/י שעה או יום אחר.</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {(quarters ?? FOLLOWUP_QUARTERS.map(minute => ({ minute, time: `${time.split(':')[0]}:${String(minute).padStart(2,'0')}`, available: true, takenBy: null }))).map((q) => (
                        <button
                          key={q.minute}
                          type="button"
                          disabled={!q.available}
                          title={q.takenBy ? `תפוס על ידי ${q.takenBy}` : undefined}
                          onClick={() => setQuarter(q.minute)}
                          className={`px-2 py-2 rounded-lg text-sm border transition ${quarter === q.minute ? 'bg-[#01696f] text-white border-[#01696f]' : q.available ? 'border-slate-300 hover:bg-slate-50' : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                        >
                          {q.time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
