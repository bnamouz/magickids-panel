'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CHANGE_REASONS, REMOVAL_REASONS, NOTE_MAX,
  type ChangeReason, type RemovalReason,
} from '@/lib/therapists/change-reasons';
import { bookingDate, bookingTime } from './booking-ui';

type Mode = 'reschedule' | 'cancel' | 'remove';
type Slot = string | { start: string };
type Details = { requestId: string; note: string };
export type AppointmentAction =
  | (Details & { action: 'change_preview'; kind: Exclude<Mode, 'remove'>; reason: ChangeReason; start?: string })
  | (Details & { action: 'reschedule'; reason: ChangeReason; start: string; notify: boolean })
  | (Details & { action: 'cancel_appointment'; reason: ChangeReason; notify: boolean })
  | (Details & { action: 'remove_patient'; reason: RemovalReason });
export type AppointmentResult = { status: 'rescheduled' | 'cancelled' | 'removed'; calendar?: string; whatsapp?: string };
type Props = {
  requestId: string;
  patientName: string;
  scheduledAt?: string | null;
  scheduled: boolean;
  variant?: 'portal' | 'diary';
  disabled?: boolean;
  slots?: readonly Slot[];
  loadSlots?: () => Promise<readonly Slot[]>;
  call: (body: AppointmentAction) => Promise<unknown>;
  onDone: (result: AppointmentResult, action: Exclude<AppointmentAction, { action: 'change_preview' }>) => void;
};

const titles: Record<Mode, string> = {
  reschedule: 'שינוי מועד',
  cancel: 'ביטול התור',
  remove: 'הסרה מהרשימה',
};
const confirmTitles: Record<Mode, string> = {
  reschedule: 'שמירת המועד החדש',
  cancel: 'אישור ביטול התור',
  remove: 'אישור ההסרה',
};

export const appointmentErrors: Partial<Record<string, string>> = {
  invalid_reason: 'בחרי סיבה מהרשימה.',
  note_required: 'כשבוחרים בסיבה ״אחר״, יש להוסיף פירוט.',
  note_invalid: `הזיני עד ${NOTE_MAX} תווים, ללא קישורים או תווים מיוחדים שאינם נתמכים.`,
  slot_taken: 'המועד כבר אינו פנוי. רענני את הזמינות ובחרי מועד אחר.',
  invalid_state: 'מצב הפנייה השתנה. רענני את הרשימה לפני שתנסי שוב.',
  busy: 'הפנייה בטיפול כעת. המתיני מעט ורענני לפני ניסיון נוסף.',
  not_assigned: 'הפנייה אינה מוקצית לך.',
  invalid_request: 'לא ניתן לבצע את הפעולה עם הפרטים שנבחרו.',
  unavailable: 'לא ניתן לבצע את הפעולה כרגע. נסי שוב מאוחר יותר.',
};

export const whatsappLabels: Partial<Record<string, string>> = {
  accepted: 'ההודעה התקבלה אצל ספק ה־WhatsApp.',
  skipped: 'לא נשלחה הודעת WhatsApp.',
  failed: 'שליחת הודעת WhatsApp נכשלה. יש לעדכן את ההורים בדרך אחרת.',
  unknown: 'לא ידוע אם הודעת ה־WhatsApp התקבלה אצל הספק. בדקי לפני שליחה נוספת.',
  not_configured: 'שליחת WhatsApp אינה מוגדרת. יש לעדכן את ההורים בדרך אחרת.',
};

export function appointmentResultText(result: AppointmentResult) {
  const saved = result.status === 'rescheduled'
    ? 'המועד החדש נשמר במכון.'
    : result.status === 'cancelled'
      ? 'התור בוטל במכון והפנייה נשארה ברשימה לתיאום מחדש.'
      : 'הפנייה הוסרה מהרשימה.';
  const calendar = result.calendar === 'synced'
    ? 'יומן Google עודכן.'
    : result.calendar === 'none' || result.calendar === 'skipped'
      ? 'לא נדרש עדכון ביומן Google.'
      : result.calendar === 'not_configured'
        ? 'החיבור ליומן Google אינו מוגדר.'
        : result.calendar === 'failed'
          ? 'עדכון יומן Google נכשל. פני לצוות המכון לבדיקה.'
          : 'עדכון יומן Google עדיין לא אושר.';
  const whatsapp = result.status === 'removed' ? whatsappLabels.skipped : whatsappLabels[result.whatsapp ?? 'unknown'] ?? whatsappLabels.unknown;
  return [saved, calendar, whatsapp].join(' ');
}

const slotStart = (slot: Slot) => typeof slot === 'string' ? slot : slot.start;
const slotLabel = (start: string) => `${bookingDate(start)} · ${bookingTime(start)}`;
const previewText = (text: string) => text.split(/(\d{2,4}(?:-\d{2,4}){2,3})/g).map((part, i) =>
  i % 2 ? <bdi key={i} dir="ltr" className="whitespace-nowrap">{part}</bdi> : part);

export default function AppointmentEditor({
  requestId, patientName, scheduledAt, scheduled, variant = 'portal', disabled, slots, loadSlots, call, onDone,
}: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [reason, setReason] = useState('');
  const [start, setStart] = useState('');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [slotsError, setSlotsError] = useState('');
  const [remoteSlots, setRemoteSlots] = useState<readonly Slot[]>();
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [pending, setPending] = useState<'preview' | 'submit' | null>(null);
  const operation = useRef(false);
  const slotsAttempt = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const panelId = useId();
  const slotId = useId();
  const reasonId = useId();
  const noteId = useId();
  const noteCounterId = useId();
  const previewId = useId();
  const diary = variant === 'diary';
  const secondary = diary ? '' : 'btn-ghost min-h-11 !px-4 !py-2';
  const primary = diary ? 'rb-primary' : 'btn-primary min-h-11 !px-4 !py-2';
  const actions = diary ? 'rb-actions !max-w-none' : 'flex flex-wrap items-center gap-2';
  const locked = !!pending || disabled;
  const choices = useMemo(() => {
    if (mode !== 'reschedule') return [];
    const current = scheduledAt ? Date.parse(scheduledAt) : NaN;
    return (remoteSlots ?? slots ?? []).map(slotStart)
      .filter(value => Date.parse(value) !== current)
      .map(value => ({ value, label: slotLabel(value) }));
  }, [mode, remoteSlots, slots, scheduledAt]);
  const selectedSlot = choices.some(slot => slot.value === start) ? start : '';
  const ready = !!reason && (reason !== 'other' || !!note.trim()) &&
    (mode !== 'reschedule' || (!!selectedSlot && !loadingSlots));

  useEffect(() => {
    if (mode) heading.current?.focus();
  }, [mode]);

  async function refreshSlots() {
    if (!loadSlots) return;
    const attempt = ++slotsAttempt.current;
    setRemoteSlots(undefined);
    setLoadingSlots(true);
    setSlotsError('');
    try {
      const next = await loadSlots();
      if (attempt === slotsAttempt.current) setRemoteSlots(next);
    } catch (e) {
      if (attempt === slotsAttempt.current) setSlotsError(e instanceof Error ? e.message : 'לא ניתן לטעון מועדים פנויים.');
    } finally {
      if (attempt === slotsAttempt.current) setLoadingSlots(false);
    }
  }

  function open(next: Mode, button: HTMLButtonElement) {
    slotsAttempt.current++;
    trigger.current = button;
    setMode(next);
    setReason('');
    setStart('');
    setNote('');
    setNotify(true);
    setPreview('');
    setError('');
    setSlotsError('');
    setLoadingSlots(false);
    setRemoteSlots(undefined);
    if (next === 'reschedule') void refreshSlots();
  }

  function close(restoreFocus = true) {
    ++slotsAttempt.current;
    setMode(null);
    if (restoreFocus) trigger.current?.focus();
  }

  function fieldChanged() {
    setPreview('');
    setError('');
  }

  async function showPreview() {
    if (!mode || mode === 'remove' || !ready || !notify || operation.current) return;
    operation.current = true;
    setPending('preview');
    setError('');
    try {
      const result = await call({
        action: 'change_preview', requestId, kind: mode, reason: reason as ChangeReason,
        ...(mode === 'reschedule' ? { start: selectedSlot } : {}),
        note: note.trim(),
      }) as { text?: unknown };
      if (typeof result.text !== 'string' || !result.text) throw new Error('לא ניתן להציג את ההודעה. נסי שוב.');
      setPreview(result.text);
    } catch (e) {
      setPreview('');
      setError(e instanceof Error ? e.message : 'לא ניתן להציג את ההודעה.');
    } finally {
      operation.current = false;
      setPending(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode || !ready || operation.current || (mode !== 'remove' && notify && !preview)) return;
    operation.current = true;
    setPending('submit');
    setError('');
    const details = { requestId, note: note.trim() };
    const action: AppointmentAction = mode === 'remove'
      ? { ...details, action: 'remove_patient', reason: reason as RemovalReason }
      : mode === 'cancel'
        ? { ...details, action: 'cancel_appointment', reason: reason as ChangeReason, notify }
        : { ...details, action: 'reschedule', reason: reason as ChangeReason, start: selectedSlot, notify };
    try {
      const result = await call(action) as AppointmentResult;
      const expected = mode === 'remove' ? 'removed' : mode === 'cancel' ? 'cancelled' : 'rescheduled';
      if (result?.status !== expected) throw new Error('לא התקבל אישור על ביצוע הפעולה. רענני לפני ניסיון נוסף.');
      close(false);
      onDone(result, action);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'לא התקבל אישור על ביצוע הפעולה.');
    } finally {
      operation.current = false;
      setPending(null);
    }
  }

  return <div dir="rtl" className={diary ? 'rb-appointment-editor' : 'space-y-3 min-w-0'}>
    <div className={actions}>
      {(scheduled ? ['reschedule', 'cancel', 'remove'] as const : ['remove'] as const).map(key =>
        <button key={key} type="button" className={diary ? secondary : `${secondary} aria-expanded:bg-teal-50`}
          aria-expanded={mode === key} aria-controls={mode ? panelId : undefined}
          disabled={locked} onClick={e => mode === key ? close() : open(key, e.currentTarget)}>{titles[key]}</button>)}
    </div>
    {mode && <section id={panelId} aria-labelledby={titleId}
      className={diary ? 'rb-edit-panel' : 'min-w-0 rounded-xl border border-teal-200 bg-teal-50/50 p-4 sm:p-5'}
      onKeyDown={e => { if (e.key === 'Escape' && !pending) { e.preventDefault(); close(); } }}>
      <h4 id={titleId} ref={heading} tabIndex={-1} className="mb-2 text-lg font-bold">
        {titles[mode]}: <bdi>{patientName}</bdi>
      </h4>
      {scheduledAt && mode !== 'remove' && <p className="mb-3">המועד הנוכחי: {bookingDate(scheduledAt)} · <bdi>{bookingTime(scheduledAt)}</bdi></p>}
      {mode === 'cancel' && <p className="mb-3">רק התור יבוטל. הפנייה תישאר ברשימה שלך לתיאום מועד חדש.</p>}
      {mode === 'remove' && <p className={diary ? 'rb-edit-warning' : 'mb-4 rounded-lg bg-amber-50 p-3 text-amber-900'}>
        הפנייה תיעלם מהרשימה שלך{scheduled ? ' והתור יבוטל' : ''}. לא תישלח הודעה להורים.
      </p>}
      <form className={diary ? 'rb-edit-form' : 'space-y-4'} onSubmit={e => void submit(e)}>
        {mode === 'reschedule' && <div>
          <label className="block" htmlFor={slotId}>מועד חדש (חובה)</label>
          <select id={slotId} className="input w-full min-w-0 rounded-md border border-slate-300 bg-white p-2"
            value={selectedSlot} onChange={e => { setStart(e.target.value); fieldChanged(); }} required
            disabled={locked || loadingSlots || !choices.length}>
            <option value="">{loadingSlots ? 'טוענת מועדים פנויים…' : 'בחרי מועד פנוי'}</option>
            {choices.map(slot => <option key={slot.value} value={slot.value}>{slot.label}</option>)}
          </select>
          {loadingSlots ? <p role="status">טוענת מועדים פנויים…</p> : slotsError
            ? <p role="alert">{slotsError}</p>
            : !choices.length && <p>אין מועדים פנויים כרגע.</p>}
          {loadSlots && <button type="button" className={secondary} disabled={locked || loadingSlots}
            onClick={() => { setStart(''); fieldChanged(); void refreshSlots(); }}>רענון מועדים פנויים</button>}
        </div>}
        <div>
          <label className="block" htmlFor={reasonId}>סיבה (חובה)</label>
          <select id={reasonId} className="input w-full min-w-0 rounded-md border border-slate-300 bg-white p-2"
            required value={reason} disabled={locked}
            onChange={e => { setReason(e.target.value); fieldChanged(); }}>
            <option value="">בחרי סיבה</option>
            {(mode === 'remove' ? REMOVAL_REASONS : CHANGE_REASONS).map(r =>
              <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block" htmlFor={noteId}>
            {mode === 'remove' ? 'הערה פנימית לצוות' : 'הודעה להורים'} {reason === 'other' ? '(חובה)' : '(רשות)'}
          </label>
          <textarea id={noteId} className={diary ? 'rb-textarea' : 'w-full min-w-0 rounded-md border border-slate-300 bg-white p-2'}
            dir="auto" rows={3} maxLength={NOTE_MAX} aria-describedby={noteCounterId} value={note} disabled={locked}
            required={reason === 'other'} onChange={e => { setNote(e.target.value); fieldChanged(); }} />
          <span id={noteCounterId} className="block text-sm text-slate-600">ללא קישורים · <bdi>{note.length}/{NOTE_MAX}</bdi> תווים</span>
        </div>
        {mode !== 'remove' && <>
          <label className={diary ? 'rb-check' : 'flex min-h-11 items-center gap-2'}>
            <input type="checkbox" className={diary ? '' : 'h-5 w-5 accent-teal-700'} disabled={locked}
              checked={notify} onChange={e => { setNotify(e.target.checked); fieldChanged(); }} />
            לשלוח הודעת WhatsApp להורים
          </label>
          {notify ? <section className={diary ? 'rb-edit-preview' : 'min-w-0 space-y-2 rounded-lg border border-teal-200 bg-white p-3'} aria-labelledby={previewId}>
            <h5 id={previewId} className="font-semibold">תצוגה מקדימה של ההודעה</h5>
            <div aria-live="polite">
              {preview ? <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere]">{previewText(preview)}</p> :
                <p>כדי לשלוח הודעה, בדקי תחילה את הנוסח שיקבלו ההורים.</p>}
            </div>
            <button type="button" className={secondary} disabled={locked || !ready}
              onClick={() => void showPreview()}>{pending === 'preview' ? 'טוענת תצוגה מקדימה…' : preview ? 'הצגה מחדש' : 'הצגת נוסח ההודעה'}</button>
          </section> : <p>לא תישלח הודעת WhatsApp. אם צריך לעדכן את ההורים, פני אליהם בדרך אחרת.</p>}
        </>}
        {error && <p role="alert" className="text-red-800">{error}</p>}
        <div className={actions}>
          <button type="submit" className={mode === 'remove'
            ? `${primary} ${diary ? 'rb-edit-destructive' : '!bg-red-800 hover:!bg-red-900'}`
            : primary} disabled={locked || !ready || (mode !== 'remove' && notify && !preview)}>
            {pending === 'submit' ? 'שומרת…' : confirmTitles[mode]}
          </button>
          <button type="button" className={secondary} disabled={locked} onClick={() => close()}>חזרה</button>
        </div>
      </form>
    </section>}
  </div>;
}
