'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  CLINIC_PHONE, DRUG_REMINDER_AFTER_BUSINESS_DAYS, MACCABI_DRUG_APPEAL_EMAIL, MACCABI_DRUG_APPROVAL_EMAIL,
  drugFamilyNotice, drugReadyNotice, drugService, imagingService, isDrugKind, statusLabel, type CommitmentStatus, type RequestKind,
} from '@/lib/maccabi/commitment-shared';

type Row = { id: string; reference: string; clinic_patient_id?: string | null; birth_date?: string | null; patient_name: string; national_id: string; phone: string; service: string; status: CommitmentStatus; sent_at: string; last_reminder_at: string | null; reminders_count: number; last_checked_at: string | null; last_reply_at: string | null; last_reply_snippet: string | null; ready_at: string | null; ready_source: string | null; patient_notified_at: string | null; notify_error: string | null; attachments: { filename: string }[]; note: string | null; kind?: RequestKind | null; appeal_of?: string | null };
type Patient = { id: string; name: string; national_id: string | null; phone: string; birth_date: string | null };
type MailStatus = { send: boolean; read: 'ok' | 'unauthorized' | 'not_configured' | 'error'; client_id: string | null; client_email: string | null };
type Upload = { path: string; filename: string };
type DrugKind = 'drug_approval' | 'drug_appeal';
type Tab = 'commitment' | 'imaging' | 'drugs';
type Lang = 'he' | 'ar';
type Confirmation = { id: string; action: string; lang?: Lang };
type Draft = {
  clinic_patient_id: string | null; patient_name: string; national_id: string; birth_date: string; phone: string;
  service: string; serviceOther: string; imagingType: string; imagingDetail: string;
  drugName: string; drugDosage: string; note: string; uploads: Upload[]; test_to_self: boolean; notify_family: boolean; lang: Lang;
  appeal_of: string | null; appealReference: string;
};
const newDraft = (service: string, imagingType: string): Draft => ({
  clinic_patient_id: null, patient_name: '', national_id: '', birth_date: '', phone: '',
  service, serviceOther: '', imagingType, imagingDetail: '', drugName: '', drugDosage: '',
  note: '', uploads: [], test_to_self: false, notify_family: false, lang: 'he', appeal_of: null, appealReference: '',
});
const TABS: readonly Tab[] = ['commitment', 'imaging', 'drugs'];
const DRUG_MODES: readonly DrugKind[] = ['drug_approval', 'drug_appeal'];
const tabFor = (kind: RequestKind): Tab => isDrugKind(kind) ? 'drugs' : kind;
const rowAnchor = (id: string) => `desk-request-${id}`;
const isNotifyAction = (action: string) => action === 'ready' || action === 'notify_again';
const renderNotice = (notice: string) => notice.endsWith(CLINIC_PHONE)
  ? <>{notice.slice(0, -CLINIC_PHONE.length)}<bdi dir="ltr">{CLINIC_PHONE}</bdi></>
  : notice;

const CHIP: Record<CommitmentStatus, string> = { sent: 'bg-sky-100 text-sky-800', reminded: 'bg-amber-100 text-amber-800', reply_received: 'bg-violet-100 text-violet-800', ready: 'bg-emerald-100 text-emerald-800', rejected: 'bg-rose-100 text-rose-800', cancelled: 'bg-slate-200 text-slate-700' };
const ERR: Record<string, string> = { invalid_body: 'בדקו את השדות (שם, ת.ז. 5–9 ספרות, טלפון 05X…)', mail_not_configured: 'שליחת מייל אינה מוגדרת במערכת', send_failed: 'שליחת המייל נכשלה – נסו שוב', file_missing: 'קובץ מצורף חסר – העלו שוב', too_large: 'הקבצים גדולים מדי (עד 15MB לקובץ, 20MB סה״כ)', file_too_large: 'אפשר לצרף קובץ בגודל של עד 15MB', unsupported_type: 'סוג קובץ לא נתמך (PDF/JPG/PNG בלבד)', recommendation_required: 'יש לצרף את מסמך ההמלצה לבדיקה', imaging_not_ready: 'עמדת הדימות עדיין לא הופעלה במערכת – הבקשה לא נשלחה', db: 'המייל נשלח אך הרישום במערכת נכשל – פנו למנהל', mail_read_unauthorized: 'אין הרשאת קריאת מייל – ראו ההנחיה למעלה', mail_read_not_configured: 'קריאת מייל אינה מוגדרת', not_open: 'הבקשה אינה פתוחה', action_failed: 'הפעולה נכשלה – נסו שוב', forbidden: 'אין הרשאה',
  justification_required: 'יש להזין נימוק רפואי באורך של 10 תווים לפחות.',
  appeal_address_missing: 'כתובת המייל לערעורים טרם הוגדרה. אפשר לשלוח בדיקה לתיבת המכון בלבד.',
  appeal_not_found: 'לא נמצאה בקשת אישור התרופה המקורית. בדקו את הבקשה והקישור.',
  drugs_not_ready: 'עמדת אישורי התרופות טרם הופעלה. הפנייה לא נשלחה.',
};
const DRUG_FILE_REQUIRED = 'יש לצרף מכתב המלצה מרופא מומחה לפני השליחה.';
const TEXT: Record<RequestKind, { tab: string; title: string; note: string; files: string; submit: string; remind: string; remindConfirm: string; readyBtn: string; readyConfirm: string; readyOk: string; readyFail: string; readySince: string; empty: string }> = {
  commitment: { tab: 'התחייבות (טופס\u00A017)', title: 'בקשת התחייבות חדשה ממכבי', note: 'הערה לסניף (לא חובה)', files: 'הפניה / מסמכים לצירוף (PDF, JPG, PNG)', submit: 'שליחת הבקשה למכבי', remind: 'תזכורת לסניף', remindConfirm: 'לשלוח תזכורת לסניף עכשיו?', readyBtn: 'ההתחייבות מוכנה – עדכון המשפחה', readyConfirm: 'לסמן כמוכן ולשלוח WhatsApp ל־', readyOk: 'ההתחייבות מוכנה – המשפחה עודכנה ב־WhatsApp', readyFail: 'ההתחייבות מוכנה אך שליחת ה־WhatsApp נכשלה – שלחו שוב', readySince: 'מוכן מאז', empty: 'אין בקשות פתוחות.' },
  imaging: { tab: 'אישור בדיקת\u00A0דימות', title: 'בקשה לאישור בדיקת דימות', note: 'הערה למרכז הדימות (לא חובה)', files: 'מסמך ההמלצה לבדיקה * (PDF, JPG, PNG)', submit: 'שליחת הבקשה למרכז הדימות', remind: 'תזכורת למרכז הדימות', remindConfirm: 'לשלוח תזכורת למרכז הדימות עכשיו?', readyBtn: 'הבדיקה אושרה – עדכון המשפחה', readyConfirm: 'לסמן שהבדיקה אושרה ולשלוח WhatsApp ל־', readyOk: 'הבדיקה אושרה – המשפחה עודכנה ב־WhatsApp', readyFail: 'הבדיקה סומנה כמאושרת אך שליחת ה־WhatsApp נכשלה – שלחו שוב', readySince: 'אושר מאז', empty: 'אין בקשות דימות פתוחות.' },
  drug_approval: { tab: 'בקשה לאישור תרופה', title: 'בקשה לאישור תרופה', note: 'אבחנה ונימוק רפואי *', files: 'מכתב רופא מומחה ומסמכים * (PDF, JPG, PNG)', submit: 'שליחת בקשה לאישור תרופה', remind: 'תזכורת למחלקת אישורי תרופות', remindConfirm: 'לשלוח כעת תזכורת למחלקת אישורי התרופות?', readyBtn: 'התרופה אושרה · עדכון המשפחה', readyConfirm: 'לסמן שהתרופה אושרה ולשלוח הודעת WhatsApp ל־', readyOk: 'התרופה אושרה והודעת WhatsApp נשלחה למשפחה.', readyFail: 'התרופה סומנה כמאושרת, אך הודעת WhatsApp לא נשלחה למשפחה.', readySince: 'התרופה אושרה בתאריך', empty: 'אין בקשות אישור תרופה או ערעורים פתוחים.' },
  drug_appeal: { tab: 'ערעור על החלטה', title: 'ערעור רופא על החלטה', note: 'נימוקי הערעור *', files: 'מסמכים חדשים לצירוף (רשות, PDF, JPG, PNG)', submit: 'שליחת ערעור למכבי', remind: 'תזכורת על הערעור', remindConfirm: 'לשלוח כעת תזכורת על הערעור?', readyBtn: 'הערעור התקבל · עדכון המשפחה', readyConfirm: 'לסמן שהערעור התקבל ולשלוח הודעת WhatsApp ל־', readyOk: 'הערעור התקבל והודעת WhatsApp נשלחה למשפחה.', readyFail: 'סומן שהערעור התקבל, אך הודעת WhatsApp לא נשלחה למשפחה.', readySince: 'הערעור התקבל בתאריך', empty: 'אין בקשות אישור תרופה או ערעורים פתוחים.' },
};
const kindOf = (r: { kind?: RequestKind | null }): RequestKind => r.kind === 'imaging' || isDrugKind(r.kind) ? r.kind : 'commitment';
const fmt = (d: string | null) => d ? new Date(d).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }) : '—';
const localDayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: 'numeric', day: 'numeric' });
const dueFormat = new Intl.DateTimeFormat('he-IL', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
/** Represent a Jerusalem calendar date as UTC midnight so DST cannot change the date enumeration. */
function israelDay(date: Date) {
  const parts = Object.fromEntries(localDayFormat.formatToParts(date).map(({ type, value }) => [type, value]));
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
}
function responseDue(sentAt: string) {
  const sent = new Date(sentAt);
  if (!Number.isFinite(+sent)) return null;
  const due = israelDay(sent);
  for (let remaining = DRUG_REMINDER_AFTER_BUSINESS_DAYS - 1; remaining > 0;) {
    due.setUTCDate(due.getUTCDate() + 1);
    if (due.getUTCDay() < 5) remaining--;
  }
  return due;
}

export default function SecretaryDesk({ services, imagingTypes, branchEmail, imagingEmails, staffName }: { services: string[]; imagingTypes: string[]; branchEmail: string; imagingEmails: string[]; staffName: string }) {
  const [kind, setKind] = useState<RequestKind>('commitment');
  const [drugMode, setDrugMode] = useState<DrugKind>('drug_approval');
  const [fileError, setFileError] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [mail, setMail] = useState<MailStatus | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const emptyDraft = () => newDraft(services[0] ?? '', imagingTypes[0] ?? '');
  const [drafts, setDrafts] = useState<Record<RequestKind, Draft>>(() => ({
    commitment: emptyDraft(), imaging: emptyDraft(), drug_approval: emptyDraft(), drug_appeal: emptyDraft(),
  }));
  const form = drafts[kind];
  const { uploads } = form;
  const [q, setQ] = useState(''); const [hits, setHits] = useState<Patient[]>([]);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const readyDialog = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileButton = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const focusAppeal = useRef(false);
  const busyLock = useRef(false);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const drug = isDrugKind(kind);
  const activeTab = tabFor(kind);
  const requireFile = kind === 'imaging' || kind === 'drug_approval';
  const appealBlocked = kind === 'drug_appeal' && !MACCABI_DRUG_APPEAL_EMAIL.trim() && !form.test_to_self;
  const linkedAppeal = kind === 'drug_appeal' && !!form.appeal_of;
  const notifyRow = confirm && isNotifyAction(confirm.action) ? rows?.find((r) => r.id === confirm.id) : undefined;
  const notifyKind = notifyRow ? kindOf(notifyRow) : null;
  const showReadyDialog = !!notifyRow && isDrugKind(notifyKind);
  const patchDraft = (k: RequestKind, change: (current: Draft) => Draft) =>
    setDrafts((previous) => ({ ...previous, [k]: change(previous[k]) }));
  const setForm = (next: Draft | ((previous: Draft) => Draft)) =>
    patchDraft(kind, (current) => typeof next === 'function' ? next(current) : next);
  const startBusy = (action: string) => {
    if (busyLock.current) return false;
    busyLock.current = true;
    setBusy(action);
    return true;
  };
  const endBusy = () => { busyLock.current = false; setBusy(null); };

  const load = useCallback(async (reportError = true) => {
    try {
      const r = await fetch('/api/admin/secretary/commitments', { cache: 'no-store' });
      if (r.ok) { setRows((await r.json()).commitments); return true; }
    } catch { /* Handled below without losing a known send result. */ }
    if (reportError) setMsg({ kind: 'err', text: 'טעינת הרשימה נכשלה' });
    return false;
  }, []);
  useEffect(() => { load(); fetch('/api/admin/secretary/mail-status', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then(setMail).catch(() => null); }, [load]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/secretary/patients?q=${encodeURIComponent(q)}`, { cache: 'no-store', signal: controller.signal });
        if (r.ok && !controller.signal.aborted) {
          const d = await r.json();
          if (!controller.signal.aborted) setHits(d.patients);
        }
      } catch { if (!controller.signal.aborted) setHits([]); }
    }, 250);
    return () => { clearTimeout(t); controller.abort(); };
  }, [q]);
  useEffect(() => {
    if (kind === 'drug_appeal' && focusAppeal.current) {
      focusAppeal.current = false;
      formHeading.current?.focus();
    }
  }, [kind, form.appeal_of]);
  useEffect(() => {
    const dialog = readyDialog.current;
    if (showReadyDialog && !dialog?.open) dialog?.showModal();
    else if (!showReadyDialog && dialog?.open) dialog.close();
  }, [showReadyDialog]);

  const pick = (p: Patient) => {
    if (linkedAppeal || busyLock.current) return;
    setForm((f) => ({ ...f, clinic_patient_id: p.id, patient_name: p.name, national_id: p.national_id ?? '', phone: p.phone, birth_date: p.birth_date ?? '' }));
    setHits([]); setQ('');
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || !startBusy('upload')) return;
    setMsg(null);
    try {
      for (const f of Array.from(files)) {
        const r = await fetch('/api/admin/secretary/commitments', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: f.name, type: f.type, size: f.size }) });
        const d = await r.json();
        if (!r.ok) { setMsg({ kind: 'err', text: `${f.name}: ${ERR[d.error] ?? 'העלאה נכשלה'}` }); continue; }
        const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', f);
        const up = await fetch(d.signedUrl, { method: 'PUT', headers: { apikey: d.apikey }, body: fd });
        if (!up.ok) { setMsg({ kind: 'err', text: `${f.name}: העלאה נכשלה` }); continue; }
        setForm((current) => ({ ...current, uploads: [...current.uploads, { path: d.path, filename: f.name }] }));
        setFileError(false);
      }
    } catch { setMsg({ kind: 'err', text: 'העלאת הקבצים נכשלה. נסו שוב.' }); }
    finally { endBusy(); if (fileRef.current) fileRef.current.value = ''; }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busyLock.current) return;
    setMsg(null);
    if (appealBlocked) { setMsg({ kind: 'err', text: ERR.appeal_address_missing }); return; }
    if (drug && (!form.drugName.trim() || !form.drugDosage.trim())) {
      setMsg({ kind: 'err', text: 'יש להזין שם תרופה, מינון וצורת מתן.' }); return;
    }
    if (drug && form.note.trim().length < 10) {
      setMsg({ kind: 'err', text: ERR.justification_required }); noteRef.current?.focus(); return;
    }
    if (requireFile && !uploads.length) {
      setFileError(true);
      (drug ? fileButton.current : fileRef.current)?.focus();
      return;
    }
    if (!startBusy('send')) return;
    const service = drug ? drugService(form.drugName, form.drugDosage)
      : kind === 'imaging' ? imagingService(form.imagingType, form.imagingDetail)
        : form.service === 'אחר' ? form.serviceOther.trim() : form.service;
    try {
      const r = await fetch('/api/admin/secretary/commitments', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind, clinic_patient_id: form.clinic_patient_id, patient_name: form.patient_name,
          national_id: form.national_id, birth_date: form.birth_date || null, phone: form.phone, service,
          note: drug ? form.note.trim() : form.note, uploads, test_to_self: form.test_to_self,
          ...(drug ? { notify_family: form.notify_family && !form.test_to_self, lang: form.lang } : {}),
          ...(kind === 'drug_appeal' && form.appeal_of ? { appeal_of: form.appeal_of } : {}),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (d.error === 'recommendation_required' && requireFile) setFileError(true);
        setMsg({ kind: 'err', text: drug && d.error === 'recommendation_required' ? DRUG_FILE_REQUIRED : ERR[d.error] ?? 'השליחה נכשלה' });
        return;
      }
      if (!d.commitment?.reference) { setMsg({ kind: 'err', text: 'לא התקבל אישור לשליחה. בדקו את הרשימה לפני ניסיון נוסף.' }); return; }
      const ref = `(אסמכתא ${d.commitment.reference})`;
      let outcome: { kind: 'ok' | 'warn'; text: string };
      if (form.test_to_self) outcome = { kind: 'ok', text: `מייל בדיקה נשלח לתיבת המכון ${ref}.` };
      else if (drug) {
        const sent = kind === 'drug_appeal' ? 'הערעור נשלח למכבי' : 'הבקשה נשלחה למחלקת אישורי התרופות של מכבי';
        const family = d.family_notice === 'sent' ? 'הודעת WhatsApp נשלחה למשפחה.'
          : d.family_notice === 'failed' ? 'לא התקבל אישור לשליחת הודעת WhatsApp למשפחה. בדקו לפני שתעדכנו בדרך אחרת.'
            : 'לא נשלחה הודעת WhatsApp למשפחה.';
        outcome = { kind: d.family_notice === 'failed' ? 'warn' : 'ok', text: `${sent} ${ref}. ${family}` };
      } else outcome = { kind: 'ok', text: kind === 'imaging'
        ? `הבקשה ומסמך ההמלצה נשלחו למרכז הדימות של מכבי ${ref}. אם מכבי תשיב במייל, התשובה תופיע בכרטיס הבקשה. כשהבדיקה מאושרת סמנו זאת כאן, והמשפחה תקבל עדכון.`
        : `הבקשה נשלחה לסניף מכבי ${ref}. המזכירה תעקוב כל בוקר ותעדכן את המשפחה כשההתחייבות מוכנה.` };
      setForm(emptyDraft()); setFileError(false); setQ(''); setHits([]);
      const refreshed = await load(false);
      setMsg(refreshed ? outcome : { kind: 'warn', text: `${outcome.text} הרשימה לא התרעננה.` });
    } catch {
      setMsg({ kind: 'err', text: 'לא התקבל אישור לשליחה. בדקו את הרשימה לפני ניסיון נוסף.' });
    } finally { endBusy(); }
  };

  const act = async (row: Row, action: string, lang: Lang = 'he') => {
    if (!startBusy(row.id + action)) return;
    setConfirm(null); setMsg(null);
    const rowKind = kindOf(row);
    const t = TEXT[rowKind];
    try {
      const r = await fetch(`/api/admin/secretary/commitments/${row.id}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...(isDrugKind(rowKind) && isNotifyAction(action) ? { lang } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ kind: 'err', text: ERR[d.error] ?? 'הפעולה נכשלה' }); return; }
      if (action === 'check') {
        const a = d.result?.action as string;
        setMsg({ kind: a === 'ready_notify_failed' ? 'warn' : 'ok', text: a === 'no_change' ? 'אין תשובה חדשה ממכבי'
          : a === 'ready_notified' ? t.readyOk : a === 'ready_notify_failed' ? t.readyFail : a === 'no_thread' ? 'אין שרשור מייל לבקשה'
            : isDrugKind(rowKind) ? 'התקבלה תשובה ממכבי. קראו אותה בכרטיס ועדכנו את מצב הפנייה.'
              : rowKind === 'imaging' ? 'התקבלה תשובה ממכבי – קראו אותה בכרטיס וסמנו אם הבדיקה אושרה'
                : `התקבלה תשובה (${d.result?.verdict}) – ראו בכרטיס` });
      } else if (isNotifyAction(action)) {
        setMsg(d.whatsapp?.ok ? { kind: 'ok', text: `ההודעה נשלחה למשפחה מ${d.whatsapp.sender === 'clinic' ? 'מספר המרפאה' : d.whatsapp.sender === 'doctor' ? 'מספר ד״ר נמוז' : 'מספר המכון'}` }
          : isDrugKind(rowKind) ? { kind: 'warn', text: t.readyFail }
            : { kind: 'err', text: `${rowKind === 'imaging' ? 'סומן כמאושר' : 'סומן כמוכן'}, אך ה־WhatsApp לא נשלח (${d.whatsapp?.error ?? 'שגיאה'}) – נסו "שליחה חוזרת"` });
      } else setMsg({ kind: 'ok', text: 'עודכן' });
      await load(false);
    } catch { setMsg({ kind: 'err', text: 'לא התקבל אישור לביצוע הפעולה. בדקו את הרשימה לפני ניסיון נוסף.' }); }
    finally { endBusy(); }
  };

  const isOpenRow = (r: Row) => ['sent', 'reminded', 'reply_received'].includes(r.status);
  const mine = rows?.filter((r) => tabFor(kindOf(r)) === activeTab) ?? [];
  const open = mine.filter(isOpenRow);
  const closed = mine.filter((r) => !isOpenRow(r));
  const openCount = (tab: Tab) => rows?.filter((r) => tabFor(kindOf(r)) === tab && isOpenRow(r)).length ?? 0;
  const T = TEXT[kind];
  const switchKind = (k: RequestKind) => {
    if (busyLock.current || k === kind) return;
    setKind(k);
    if (isDrugKind(k)) setDrugMode(k);
    setMsg(null); setConfirm(null); setFileError(false); setQ(''); setHits([]);
  };
  const selectTab = (tab: Tab) => switchKind(tab === 'drugs' ? drugMode : tab);
  const tabKey = (event: KeyboardEvent<HTMLButtonElement>, tab: Tab) => {
    const index = TABS.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1
      : event.key === 'ArrowLeft' ? (index + 1) % TABS.length
        : event.key === 'ArrowRight' ? (index - 1 + TABS.length) % TABS.length : null;
    if (next === null || busyLock.current) return;
    event.preventDefault();
    selectTab(TABS[next]);
    tabRefs.current[TABS[next]]?.focus();
  };
  const beginAppeal = (r: Row) => {
    if (busyLock.current) return;
    const existing = drafts.drug_appeal;
    if (existing.appeal_of !== r.id) {
      const [drugName, ...dosage] = r.service.split(' – ');
      patchDraft('drug_appeal', () => ({
        ...emptyDraft(), clinic_patient_id: r.clinic_patient_id ?? null, birth_date: r.birth_date ?? '',
        patient_name: r.patient_name, national_id: r.national_id, phone: r.phone,
        drugName, drugDosage: dosage.join(' – '), appeal_of: r.id, appealReference: r.reference,
      }));
    }
    if (kind === 'drug_appeal' && existing.appeal_of === r.id) formHeading.current?.focus();
    else focusAppeal.current = true;
    switchKind('drug_appeal');
  };
  const whatsappPreview = drug ? drugFamilyNotice(kind, form.lang, {
    patientName: form.patient_name.trim() || '[שם המטופל/ת]',
    drug: drugService(form.drugName.trim() || '[שם התרופה]', form.drugDosage.trim() || '[מינון וצורת מתן]'),
  }) : '';
  const inputBase = 'w-full min-w-0 border rounded-lg p-2 disabled:opacity-60';
  const input = `${inputBase} bg-white`;
  const patientInput = linkedAppeal ? `${inputBase} cursor-default bg-slate-50` : input;
  const small = 'rounded-lg border px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50';

  return <div className="space-y-5">
    {mail && mail.read !== 'ok' && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-1">
      <p className="font-bold">המזכירה יכולה לשלוח בקשות, אבל עדיין לא לקרוא את תשובות מכבי אוטומטית.</p>
      {mail.read === 'unauthorized' ? <><p>כדי להפעיל מעקב אוטומטי, במסוף הניהול של Google Workspace (אבטחה ← בקרת API ← האצלה ברמת הדומיין) הוסיפו ל־Client ID הקיים את ההיקף <code dir="ltr" className="rounded bg-white px-1 break-all">https://www.googleapis.com/auth/gmail.readonly</code> לצד ההיקפים הקיימים.</p>
        {mail.client_id && <p>Client ID: <code dir="ltr" className="rounded bg-white px-1">{mail.client_id}</code></p>}</> : <p>שליחת מייל אינה מוגדרת במערכת ({mail.read}).</p>}
      <p>{drug ? 'אפשר לבדוק את התיבה ידנית ולעדכן את ההחלטה בכרטיס הפנייה.' : `עד אז אפשר לבדוק את התיבה ידנית ולסמן "${kind === 'imaging' ? 'הבדיקה אושרה' : 'ההתחייבות מוכנה'}" – ההודעה למשפחה תישלח אוטומטית.`}</p>
    </div>}
    <div role="tablist" aria-label="סוג הבקשה למכבי" className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white p-1 sm:inline-grid">
      {TABS.map((tab) => <button key={tab} type="button" role="tab" id={`desk-tab-${tab}`} ref={(node) => { tabRefs.current[tab] = node; }} aria-selected={activeTab === tab} aria-controls="desk-panel" tabIndex={activeTab === tab ? 0 : -1} aria-disabled={!!busy} onClick={() => selectTab(tab)} onKeyDown={(e) => tabKey(e, tab)}
        className={`flex min-h-11 flex-wrap items-center justify-center gap-x-1 gap-y-0 rounded-lg px-1.5 py-2 text-sm font-bold transition-colors sm:px-4 ${activeTab === tab ? 'bg-teal-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
        {tab === 'drugs' ? 'אישורי תרופות' : TEXT[tab].tab}{openCount(tab) > 0 && <span className={`rounded-full px-1.5 text-xs tabular-nums ${activeTab === tab ? 'bg-white/20' : 'bg-slate-200 text-slate-700'}`} aria-label={`${openCount(tab)} פתוחות`}>{openCount(tab)}</span>}
      </button>)}
    </div>
    <div id="desk-panel" role="tabpanel" aria-labelledby={`desk-tab-${activeTab}`} className="space-y-5">
    {msg && <div role={msg.kind === 'err' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${msg.kind === 'ok' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : msg.kind === 'warn' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-rose-300 bg-rose-50 text-rose-900'}`}>{msg.text}</div>}

    {kind === 'drug_approval' && <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950">
      <p>בקשות לאישור תרופה נשלחות למחלקת אישורי התרופות של מכבי: <bdi dir="ltr" className="font-semibold [overflow-wrap:anywhere]">{MACCABI_DRUG_APPROVAL_EMAIL}</bdi>.</p>
      <p className="mt-1">לפי מכבי, תשובה לבקשה ניתנת למטופל/ת בתוך 5 ימי עבודה במסרון לטלפון המעודכן במכבי. אם לא מתקבלת תשובה במייל, העמדה שולחת תזכורת ביום העסקים השישי.</p>
    </div>}
    <form onSubmit={submit} className="card min-w-0 space-y-4">
      {drug && <fieldset disabled={!!busy} className="min-w-0">
        <legend className="mb-2 text-sm font-semibold text-slate-700">סוג הפנייה</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {DRUG_MODES.map((mode) => <label key={mode} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${kind === mode ? 'border-teal-500 bg-teal-50 text-teal-950' : 'border-slate-200 bg-white text-slate-700'}`}>
            <input type="radio" name="drug-mode" className="accent-teal-700" checked={kind === mode} onChange={() => switchKind(mode)} />{TEXT[mode].tab}
          </label>)}
        </div>
      </fieldset>}
      <h2 className="text-xl font-bold text-teal-900" tabIndex={-1} ref={formHeading}>{T.title}</h2>
      {kind === 'drug_appeal' && (!MACCABI_DRUG_APPEAL_EMAIL.trim()
        ? <p id="desk-appeal-address" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{ERR.appeal_address_missing}</p>
        : <p className="text-sm text-slate-600">כתובת המייל לערעורים: <bdi dir="ltr" className="[overflow-wrap:anywhere]">{MACCABI_DRUG_APPEAL_EMAIL}</bdi></p>)}
      {linkedAppeal && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-100 p-3 text-sm text-slate-800">
        <span>בקשה מקורית: <a className="font-semibold text-teal-800 underline" href={`#${rowAnchor(form.appeal_of!)}`}><bdi dir="ltr">{form.appealReference}</bdi></a></span>
        <button type="button" className="min-h-8 text-teal-800 underline" disabled={!!busy} onClick={() => setForm(emptyDraft())}>פתיחת ערעור ללא קישור</button>
      </div>}
      {!drug && (kind === 'imaging'
        ? <div className="space-y-2 text-sm text-slate-600">
          <p>לבדיקת דימות שהומלצה למטופל/ת, למשל MRI או CT. הבקשה ומסמך ההמלצה נשלחים מהמייל של המכון, בשם {staffName}, אל מרכז הדימות של מכבי:</p>
          <ul className="flex flex-wrap gap-2">{imagingEmails.map((e) => <li key={e} dir="ltr" className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-800">{e}</li>)}</ul>
          <p>זמן הטיפול במכבי הוא עד 5 ימי עבודה. התשובה עשויה להגיע ישירות למשפחה או להופיע במכבי Online, ולכן אתם מסמנים כאן שהבדיקה אושרה, והמשפחה מקבלת עדכון ב־WhatsApp.</p>
        </div>
        : <p className="text-sm text-slate-600">הבקשה נשלחת מהמייל של המכון אל <bdi dir="ltr" className="[overflow-wrap:anywhere]">{branchEmail}</bdi> בשם {staffName}. חפשו מטופל/ת ממאגר מרפאת הילדים או מלאו ידנית.</p>)}
      <fieldset disabled={!!busy} className="min-w-0 space-y-4">
      {!linkedAppeal && <div className="relative">
        <label className="block text-sm font-semibold">חיפוש במטופלי המרפאה (שם / ת.ז. / טלפון)<input className={input} value={q} onChange={(e) => { setQ(e.target.value); setHits([]); }} placeholder="לדוגמה: אחמד או 052…" autoComplete="off" /></label>
        {hits.length > 0 && <ul className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow-lg max-h-64 overflow-auto">{hits.map((p) => <li key={p.id}><button type="button" className="w-full text-right px-3 py-2 hover:bg-teal-50 text-sm" onClick={() => pick(p)}>{p.name} · ת.ז. {p.national_id ?? '—'} · {p.phone || 'ללא טלפון'}</button></li>)}</ul>}
      </div>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block min-w-0 text-sm font-semibold">שם המטופל/ת *<input className={patientInput} required readOnly={linkedAppeal} minLength={2} value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value, clinic_patient_id: null })} /></label>
        <label className="block min-w-0 text-sm font-semibold">ת.ז. *<input className={patientInput} required readOnly={linkedAppeal} inputMode="numeric" value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value })} /></label>
        <label className="block min-w-0 text-sm font-semibold">טלפון ההורה (לעדכון ב־WhatsApp) *<input className={patientInput} required readOnly={linkedAppeal} inputMode="tel" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label className="block min-w-0 text-sm font-semibold">תאריך לידה<input type="date" className={patientInput} readOnly={linkedAppeal} value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></label>
        {drug ? <>
          <label className="block min-w-0 text-sm font-semibold">שם התרופה *<input className={input} required dir="auto" maxLength={98} value={form.drugName} onChange={(e) => setForm({ ...form, drugName: e.target.value })} /></label>
          <label className="block min-w-0 text-sm font-semibold">מינון וצורת מתן *<input className={input} required dir="auto" maxLength={99} value={form.drugDosage} onChange={(e) => setForm({ ...form, drugDosage: e.target.value })} /></label>
        </> : kind === 'imaging' ? <>
          <label className="block text-sm font-semibold">סוג הבדיקה *<select className={input} value={form.imagingType} onChange={(e) => setForm({ ...form, imagingType: e.target.value })}>{imagingTypes.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label className="block text-sm font-semibold">{form.imagingType === 'אחר' ? 'שם הבדיקה והאזור הנבדק *' : 'האזור הנבדק / פירוט *'}<input className={input} required minLength={2} maxLength={180} value={form.imagingDetail} onChange={(e) => setForm({ ...form, imagingDetail: e.target.value })} placeholder="לדוגמה: מוח, ללא חומר ניגוד" /></label>
        </> : <>
          <label className="block text-sm font-semibold">השירות המבוקש *<select className={input} value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}>{services.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          {form.service === 'אחר' && <label className="block text-sm font-semibold">פירוט השירות *<input className={input} required minLength={2} value={form.serviceOther} onChange={(e) => setForm({ ...form, serviceOther: e.target.value })} /></label>}
        </>}
      </div>
      <label className="block text-sm font-semibold">{T.note}<textarea ref={noteRef} className={input} rows={drug ? 3 : 2} required={drug} minLength={drug ? 10 : undefined} maxLength={2000} aria-describedby={drug ? 'desk-note-hint' : undefined} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
      {drug && <p id="desk-note-hint" className="!mt-1 text-xs text-slate-600">לפחות 10 תווים.</p>}
      <div className="space-y-2">
        {drug ? <>
          <p id="desk-files-title" className="text-sm font-semibold">{T.files}</p>
          <input ref={fileRef} type="file" multiple accept="application/pdf,image/jpeg,image/png" hidden aria-label={T.files} onChange={(e) => addFiles(e.target.files)} />
          <button ref={fileButton} type="button" className={`${small} min-h-10`} aria-describedby={requireFile ? 'desk-files-title desk-files-hint' : 'desk-files-title'} onClick={() => fileRef.current?.click()}>בחירת קבצים</button>
          {kind === 'drug_approval' && <p id="desk-files-hint" role={fileError ? 'alert' : undefined} className={`text-sm ${fileError ? 'font-semibold text-rose-700' : 'text-slate-600'}`}>{fileError ? DRUG_FILE_REQUIRED : 'חובה לצרף מכתב המלצה מרופא מומחה. אפשר לצרף מסמכים נוספים.'}</p>}
        </> : <label className="block text-sm font-semibold">{T.files}<input ref={fileRef} type="file" multiple accept="application/pdf,image/jpeg,image/png" className="block max-w-full text-sm" aria-invalid={fileError || undefined} aria-describedby={kind === 'imaging' ? 'desk-files-hint' : undefined} onChange={(e) => addFiles(e.target.files)} /></label>}
        {kind === 'imaging' && <p id="desk-files-hint" role={fileError ? 'alert' : undefined} className={`text-sm ${fileError ? 'font-semibold text-rose-700' : 'text-slate-600'}`}>{fileError ? 'יש לצרף את מסמך ההמלצה לבדיקה לפני השליחה.' : 'חובה לצרף את מסמך ההמלצה (מכתב הרופא או ההפניה לבדיקה). אפשר לצרף גם מסמכים רפואיים נוספים.'}</p>}
        {busy === 'upload' && <p className="text-sm text-slate-600" role="status">מעלה את הקובץ…</p>}
        {uploads.length > 0 && <ul className="text-sm text-slate-700 space-y-1">{uploads.map((u) => <li key={u.path} className="flex items-center gap-2"><bdi className="min-w-0 break-all">{u.filename}</bdi><button type="button" className="shrink-0 text-rose-700 underline" aria-label={`הסרת ${u.filename}`} onClick={() => setForm((f) => ({ ...f, uploads: f.uploads.filter((x) => x.path !== u.path) }))}>הסרה</button></li>)}</ul>}
      </div>
      {drug && <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <label className="flex min-h-8 items-start gap-2 text-sm font-semibold"><input type="checkbox" className="mt-1 shrink-0 accent-teal-700" checked={form.notify_family && !form.test_to_self} disabled={form.test_to_self} onChange={(e) => setForm({ ...form, notify_family: e.target.checked })} />{kind === 'drug_appeal' ? 'לעדכן את המשפחה ב־WhatsApp שהערעור נשלח' : 'לעדכן את המשפחה ב־WhatsApp שהבקשה נשלחה'}</label>
        {form.test_to_self && <p className="text-sm text-slate-600">במצב בדיקה לא נשלחת הודעה למשפחה.</p>}
        <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">שפת ההודעה<select className="min-w-0 rounded-lg border bg-white p-2" value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value as Lang })}><option value="he">עברית</option><option value="ar">ערבית</option></select></label>
        <p className="text-xs font-semibold text-slate-600">תצוגה מקדימה של ההודעה</p>
        <p lang={form.lang} dir="rtl" className="whitespace-pre-line rounded-lg border border-slate-200 bg-white p-2 text-sm leading-relaxed text-slate-800 [overflow-wrap:anywhere]">{renderNotice(whatsappPreview)}</p>
      </div>}
      <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.test_to_self} onChange={(e) => setForm({ ...form, test_to_self: e.target.checked })} /> בדיקה: לשלוח לתיבת המכון במקום למכבי</label>
      <div><button type="submit" className="btn-primary max-w-full disabled:opacity-60" disabled={!!busy || appealBlocked} aria-describedby={appealBlocked ? 'desk-appeal-address' : undefined}>{busy === 'send' ? 'שולחת…' : form.test_to_self ? 'שליחת בדיקה' : T.submit}</button></div>
      </fieldset>
    </form>

    <section className="card space-y-3">
      <h2 className="text-xl font-bold text-teal-900">בקשות פתוחות ({open.length})</h2>
      {rows === null ? <p className="text-slate-500">טוען…</p> : open.length === 0 ? <p className="text-slate-500">{T.empty}</p> : open.map(renderCard)}
    </section>
    <section className="card space-y-3">
      <h2 className="text-xl font-bold text-teal-900">הושלמו / נסגרו (60 הימים האחרונים)</h2>
      {closed.length === 0 ? <p className="text-slate-500">אין עדיין.</p> : closed.map(renderCard)}
    </section>
    </div>
    <dialog ref={readyDialog} dir="rtl" aria-labelledby="desk-ready-title" aria-describedby="desk-ready-recipient" className="fixed inset-0 !m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-auto rounded-xl border border-teal-100 bg-white p-5 text-slate-800 shadow-xl backdrop:bg-slate-950/45" onCancel={(e) => { e.preventDefault(); setConfirm(null); }}>
      {confirm && notifyRow && isDrugKind(notifyKind) && <div className="space-y-4">
        <h2 id="desk-ready-title" className="text-xl font-bold text-teal-900">{confirm.action === 'ready' ? 'עדכון המשפחה על ההחלטה' : 'שליחה חוזרת של הודעת ההחלטה'}</h2>
        <p id="desk-ready-recipient" className="text-sm">{confirm.action === 'ready' ? TEXT[notifyKind].readyConfirm : 'לשלוח שוב הודעת WhatsApp ל־'}<bdi dir="ltr">{notifyRow.phone}</bdi>?</p>
        <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">שפת ההודעה<select className="min-w-0 rounded-lg border bg-white p-2" value={confirm.lang ?? 'he'} onChange={(e) => { const lang = e.target.value as Lang; setConfirm((previous) => previous && { ...previous, lang }); }}><option value="he">עברית</option><option value="ar">ערבית</option></select></label>
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-600">תצוגה מקדימה של ההודעה</p>
          <p lang={confirm.lang ?? 'he'} dir="rtl" className="whitespace-pre-line rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed [overflow-wrap:anywhere]">{renderNotice(drugReadyNotice(notifyKind, confirm.lang, { patientName: notifyRow.patient_name, drug: notifyRow.service }))}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary !px-4 !py-2 text-sm" disabled={!!busy} onClick={() => act(notifyRow, confirm.action, confirm.lang)}>{confirm.action === 'ready' ? 'אישור ושליחת הודעה' : 'שליחה חוזרת'}</button>
          <button type="button" className={small} onClick={() => setConfirm(null)}>ביטול</button>
        </div>
      </div>}
    </dialog>
  </div>;

  function renderCard(r: Row) {
    const isOpen = isOpenRow(r);
    const rowKind = kindOf(r);
    const rowDrug = isDrugKind(rowKind);
    const rowAppeal = rowKind === 'drug_appeal';
    const t = TEXT[rowKind];
    const due = rowKind === 'drug_approval' ? responseDue(r.sent_at) : null;
    const overdue = !!due && (r.status === 'sent' || r.status === 'reminded') && israelDay(new Date()) > due;
    const original = r.appeal_of ? mine.find((row) => row.id === r.appeal_of) : null;
    const b = (a: string) => busy === r.id + a;
    return <article key={r.id} id={rowAnchor(r.id)} tabIndex={-1} className="scroll-mt-20 rounded-xl border border-slate-200 p-4 space-y-2 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center gap-2">
        {rowDrug && <span className="rounded-full bg-teal-50 px-3 py-0.5 text-xs font-bold text-teal-900">{rowAppeal ? 'ערעור' : 'אישור תרופה'}</span>}
        <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${CHIP[r.status]}`}>{statusLabel(rowKind, r.status)}</span>
        <span className="font-bold text-teal-900">{r.patient_name}</span><span className="text-sm text-slate-600">ת.ז. {r.national_id} · {r.phone} · {r.service}</span>
        <span className="ms-auto text-xs text-slate-500" dir="ltr">{r.reference}</span>
      </div>
      <p className="text-xs text-slate-600">נשלח: {fmt(r.sent_at)} · תזכורות: {r.reminders_count}{r.last_reminder_at ? ` (אחרונה ${fmt(r.last_reminder_at)})` : ''} · נבדק לאחרונה: {fmt(r.last_checked_at)}{r.attachments?.length ? ` · ${r.attachments.length} קבצים` : ''}</p>
      {due && <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <span>מועד צפוי לתשובה: <time dateTime={due.toISOString().slice(0, 10)}>{dueFormat.format(due)}</time></span>
        {overdue && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-950">המועד עבר</span>}
      </p>}
      {original && <p className="text-sm">בקשה מקורית: <a className="font-semibold text-teal-800 underline" href={`#${rowAnchor(original.id)}`}><bdi dir="ltr">{original.reference}</bdi></a></p>}
      {r.last_reply_snippet && <blockquote className="rounded-lg bg-slate-50 p-2 text-sm text-slate-800"><span className="text-xs text-slate-500">תשובת מכבי ({fmt(r.last_reply_at)}):</span><br />{r.last_reply_snippet}</blockquote>}
      {r.status === 'ready' && <p className="text-sm text-emerald-800">{t.readySince} {fmt(r.ready_at)} ({r.ready_source === 'email' ? 'זוהה מהמייל' : 'סומן ידנית'}) · {r.patient_notified_at ? `המשפחה עודכנה ב־WhatsApp ${fmt(r.patient_notified_at)}` : `המשפחה לא עודכנה${r.notify_error ? ` (${r.notify_error})` : ''}`}</p>}
      {confirm?.id === r.id && !showReadyDialog ? <div className="flex flex-wrap items-center gap-2 text-sm"><span>{confirm.action === 'ready' ? `${t.readyConfirm}${r.phone}?` : confirm.action === 'notify_again' ? `לשלוח שוב WhatsApp ל־${r.phone}?` : confirm.action === 'remind' ? t.remindConfirm : confirm.action === 'cancel' ? (rowAppeal ? 'לבטל את הערעור?' : 'לבטל את הבקשה לאישור תרופה?') : confirm.action === 'rejected' ? (rowAppeal ? 'לסמן שהערעור נדחה?' : 'לסמן שהבקשה לאישור תרופה נדחתה?') : 'לאשר?'}</span><button type="button" className="btn-primary !px-4 !py-1.5 text-sm" disabled={!!busy} onClick={() => act(r, confirm.action)}>כן</button><button type="button" className={small} onClick={() => setConfirm(null)}>ביטול</button></div>
        : <div className="flex flex-wrap gap-2">
          {isOpen && <><button type="button" className={small} disabled={!!busy} onClick={() => act(r, 'check')}>{b('check') ? 'בודקת…' : 'בדיקת מייל עכשיו'}</button>
            <button type="button" className={small} disabled={!!busy} onClick={() => setConfirm({ id: r.id, action: 'remind' })}>{t.remind}</button>
            <button type="button" className={`${small} border-emerald-600 text-emerald-800`} disabled={!!busy} onClick={() => setConfirm({ id: r.id, action: 'ready' })}>{t.readyBtn}</button>
            <button type="button" className={small} disabled={!!busy} onClick={() => rowDrug ? setConfirm({ id: r.id, action: 'rejected' }) : act(r, 'rejected')}>{rowDrug ? (rowAppeal ? 'סימון ערעור שנדחה' : 'סימון בקשה שנדחתה') : 'נדחה / חסר'}</button>
            <button type="button" className={small} disabled={!!busy} onClick={() => rowDrug ? setConfirm({ id: r.id, action: 'cancel' }) : act(r, 'cancel')}>{rowAppeal ? 'ביטול ערעור' : 'ביטול בקשה'}</button></>}
          {r.status === 'ready' && <button type="button" className={small} disabled={!!busy} onClick={() => setConfirm({ id: r.id, action: 'notify_again' })}>שליחה חוזרת למשפחה</button>}
          {rowKind === 'drug_approval' && r.status === 'rejected' && <button type="button" className={`${small} border-teal-600 font-bold text-teal-800`} disabled={!!busy} onClick={() => beginAppeal(r)}>הגשת ערעור</button>}
          {!isOpen && <button type="button" className={small} disabled={!!busy} onClick={() => act(r, 'reopen')}>פתיחה מחדש</button>}
        </div>}
      {r.note && <p className="text-xs text-slate-500">הערה: {r.note}</p>}
    </article>;
  }
}
