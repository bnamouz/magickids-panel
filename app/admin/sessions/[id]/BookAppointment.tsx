'use client';

import { useState, useEffect } from 'react';
import { candidateSlots, localParts, isAssessmentSlot, FOLLOWUP_QUARTERS } from '@/lib/booking/schedule';
import { CalendarPlus, X, Loader2, Check, AlertCircle } from 'lucide-react';
import { ConfirmationFields, ConfirmationStatus, initialNotice, type NoticeOptions } from '@/components/admin/AppointmentConfirmation';
import type { ConfirmationResult } from '@/lib/appointments/confirmation-copy';

interface Props {
  sessionId: string;
  childName: string;
  assessmentReady: boolean;
  parentEmail: string;
  parentPhone: string;
}

// Follow-ups (מעקב) are quarter-hour slots inside the same Wednesday
// 16:00–20:00 ADHD window as assessments, so up to four can share one hour.
const FOLLOWUP_HOURS = ['16:00', '17:00', '18:00', '19:00'];
const APPOINTMENT_TYPES = [
  { value: 'assessment', label: 'אבחון ADHD', duration: 60 },
  { value: 'followup', label: 'מעקב', duration: 15 },
];

type QuarterSlot = { minute: number; time: string; available: boolean; takenBy: string | null };
type HourSlot = { hour: number; time: string; assessmentAvailable: boolean; takenBy: string | null; quarters: QuarterSlot[] };
type DaySlots = { hours: HourSlot[]; existing: { time: string; label: string }[]; calendarFailed: boolean };

export default function BookAppointment({ sessionId, childName, assessmentReady, parentEmail, parentPhone }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(assessmentReady ? 'assessment' : 'followup');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('16:00');
  const [quarter, setQuarter] = useState<number | null>(null);
  const [quarters, setQuarters] = useState<QuarterSlot[] | null>(null);
  const [day, setDay] = useState<DaySlots | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [location, setLocation] = useState('מכון Magic Kids, שפרעם');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeOptions>({ ...initialNotice });
  const [noticeResult, setNoticeResult] = useState<ConfirmationResult | null>(null);
  const [uncertain, setUncertain] = useState(false);

  const duration = APPOINTMENT_TYPES.find((t) => t.value === type)?.duration ?? 60;
  const wednesdayDates = [...new Set(candidateSlots('adhd').map((iso) => localParts(new Date(iso)).date))];

  // One availability lookup per chosen day (database guard view + both Google calendars):
  // hours already taken are disabled for assessments, quarters already taken are disabled for follow-ups.
  useEffect(() => {
    if (!date) { setDay(null); setDayError(null); return; }
    let cancelled = false;
    setDayLoading(true); setDayError(null); setQuarter(null);
    fetch(`/api/admin/appointments/day-slots?date=${date}`)
      .then(async (res) => ({ ok: res.ok, data: await res.json() }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok || !Array.isArray(data.hours)) { setDay(null); setDayError(data.error || 'לא ניתן לבדוק זמינות; השעות מוצגות ללא סינון והשרת ידחה שעה תפוסה.'); return; }
        setDay(data);
      })
      .catch(() => { if (!cancelled) { setDay(null); setDayError('לא ניתן לבדוק זמינות; השעות מוצגות ללא סינון והשרת ידחה שעה תפוסה.'); } })
      .finally(() => { if (!cancelled) setDayLoading(false); });
    return () => { cancelled = true; };
  }, [date]);

  const hourInfo = day?.hours.find((h) => h.time === time) ?? null;
  // Keep the selected hour valid: jump to the first free hour when the chosen one is taken.
  useEffect(() => {
    if (!day) return;
    const usable = (h: HourSlot) => type === 'assessment' ? h.assessmentAvailable : h.quarters.some((q) => q.available);
    const current = day.hours.find((h) => h.time === time);
    if (current && usable(current)) return;
    const first = day.hours.find(usable);
    if (first) setTime(first.time);
  }, [day, type, time]);
  useEffect(() => {
    if (type !== 'followup' || !hourInfo) { setQuarters(null); return; }
    setQuarters(hourInfo.quarters);
    setQuarter((prev) => prev !== null && hourInfo.quarters.some((q) => q.minute === prev && q.available) ? prev : (hourInfo.quarters.find((q) => q.available)?.minute ?? null));
  }, [type, hourInfo]);
  const noHourFree = !!day && day.hours.every((h) => type === 'assessment' ? !h.assessmentAvailable : !h.quarters.some((q) => q.available));

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
    if ((notice.email || notice.whatsapp) && !notice.consentConfirmed) {
      setError('יש לאמת נמען והסכמה, או לבטל את בחירת שני ערוצי השליחה'); return;
    }

    if (!date || !time) {
      setError('חובה לבחור תאריך ושעה');
      return;
    }
    if (type === 'assessment' && hourInfo && !hourInfo.assessmentAvailable) {
      setError('השעה שנבחרה כבר תפוסה. בחר/י שעה פנויה.');
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
          confirmation: notice.email || notice.whatsapp
            ? { ...notice, expectedEmail: parentEmail, expectedPhone: parentPhone, expectedStart: scheduledAt, expectedLocation: location } : undefined,
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

      setNoticeResult(data.confirmation ?? null);
    } catch (e: any) {
      setUncertain(true);
      setError('תוצאת השמירה אינה ודאית. רעננו ובדקו את רשימת התורים לפני קביעת תור נוסף.');
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
                  <select aria-label="שעה" value={time} onChange={e=>setTime(e.target.value)} disabled={dayLoading} className="w-full border rounded-lg p-2">{(type === 'assessment' ? ['16:00','17:00','18:00','19:00'] : FOLLOWUP_HOURS).map(hour=>{
                    const info = day?.hours.find((h) => h.time === hour);
                    const free = info ? (type === 'assessment' ? info.assessmentAvailable : info.quarters.filter((q) => q.available).length) : null;
                    const taken = info ? (type === 'assessment' ? !info.assessmentAvailable : free === 0) : false;
                    const label = !info ? hour : type === 'assessment' ? (taken ? `${hour} · תפוס${info.takenBy ? ` (${info.takenBy})` : ''}` : hour) : (taken ? `${hour} · מלא` : `${hour} · ${free} פנויים`);
                    return <option key={hour} value={hour} disabled={taken}>{label}</option>;
                  })}</select>
                </div>
              </div>

              {date && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
                  {dayLoading ? <div className="flex items-center gap-2 text-slate-500"><Loader2 size={14} className="animate-spin" /> בודק מה כבר קבוע ביום זה...</div>
                  : dayError ? <p className="text-amber-800">{dayError}</p>
                  : <>
                      <p className="font-semibold">כבר קבוע ביום זה (16:00–20:00): {day?.existing.length ? '' : 'אין תורים — כל השעות פנויות'}</p>
                      {day?.existing.map((e, i) => <p key={i}><span dir="ltr" className="font-mono">{e.time}</span> · {e.label}</p>)}
                      {day?.calendarFailed && <p className="text-amber-800">יומן גוגל לא נטען; מוצגות רק ההזמנות מהמערכת, והשרת ידחה שעה תפוסה ביומן.</p>}
                      {noHourFree && <p className="text-red-700 font-semibold">אין שעה פנויה ביום זה. בחר/י יום רביעי אחר.</p>}
                    </>}
                </div>
              )}

              {type === 'followup' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    רבע שעה
                  </label>
                  {dayLoading ? (
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
                  maxLength={200}
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

              <ConfirmationFields value={notice} onChange={setNotice} email={parentEmail} phone={parentPhone}
                start={date && (type !== 'followup' || quarter !== null) ? `${date}T${time.split(':')[0]}:${type === 'followup' ? String(quarter).padStart(2, '0') : '00'}:00${getIsraelOffset(date)}` : undefined}
                location={location} disabled={loading || !!success || uncertain} />
              {noticeResult && <ConfirmationStatus result={noticeResult} />}
              {(success || uncertain) && <button type="button" className="underline text-sm" onClick={() => window.location.reload()}>רענון רשימת התורים ומצב השליחה</button>}

              {success && (
                <div className="flex items-start gap-2 p-3 bg-green-50 text-green-800 rounded-lg text-sm">
                  <Check size={16} className="mt-0.5 flex-shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={submit}
                  disabled={loading || dayLoading || noHourFree || !!success || uncertain || ((notice.email || notice.whatsapp) && !notice.consentConfirmed)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#01696f] text-white rounded-lg font-semibold text-sm hover:bg-[#0C4E54] transition disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> שומר...
                    </>
                  ) : (
                    <>
                      <CalendarPlus size={16} /> {notice.email || notice.whatsapp ? 'קביעת פגישה ושליחת אישור' : 'קבע פגישה ללא הודעה'}
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
