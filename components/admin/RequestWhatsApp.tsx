'use client';
import { useMemo, useState } from 'react';
import { TEMPLATES, renderTemplate, type Clinic, type Lang } from '@/lib/admin/request-templates';

/** Opens WhatsApp on the staff member's own device with a ready-made update about the request. Nothing is sent by the server. */
export default function RequestWhatsApp({ clinic, eventId, phone, parent, child, lang: initial }: { clinic: Clinic; eventId: string; phone: string; parent: string; child: string; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>(initial);
  const [id, setId] = useState(TEMPLATES[clinic][0].id);
  const [custom, setCustom] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sender, setSender] = useState<'doctor' | 'clinic'>('doctor');
  const SENDER_LOCAL = { doctor: '050-995-5137', clinic: '054-349-6656' } as const;
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ ok: boolean; message: string } | null>(null);
  const template = TEMPLATES[clinic].find(t => t.id === id) ?? TEMPLATES[clinic][0];
  const text = custom ?? renderTemplate(template, lang, { parent: parent.split(' ')[0] || parent, child });
  const digits = phone.replace(/\D/g, '');
  const intl = digits.startsWith('0') ? '972' + digits.slice(1) : digits;
  const href = useMemo(() => `https://wa.me/${intl}?text=${encodeURIComponent(text)}`, [intl, text]);
  if (!digits) return null;
  const pick = (next: string) => { setId(next); setCustom(null); setSent(null); setConfirm(false); };
  const switchLang = (l: Lang) => { setLang(l); setCustom(null); setSent(null); setConfirm(false); };
  const sendFromInstitute = async () => {
    setSending(true); setSent(null);
    try {
      const res = await fetch('/api/admin/doctor-requests/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clinic, eventId, phone: '+' + intl, text, templateTitle: template.title, sender }) });
      const data = await res.json().catch(() => ({}));
      if (data.status === 'sent') setSent({ ok: true, message: `נשלח להורה מהמספר ${SENDER_LOCAL[sender]}. נרשמה הערה על הבקשה ביומן.` });
      else if (data.status === 'sender_unavailable') setSent({ ok: false, message: data.message });
      else if (data.status === 'duplicate') setSent({ ok: true, message: data.message });
      else if (data.status === 'unknown') setSent({ ok: false, message: 'תוצאת השליחה אינה ודאית. לא לשלוח שוב לפני בדיקה בוואטסאפ שלך.' });
      else setSent({ ok: false, message: data.error === 'unauthorized' ? 'אין הרשאה. התחברו מחדש.' : `השליחה נכשלה (${data.error ?? res.status}). אפשר לשלוח מהטלפון האישי.` });
    } catch { setSent({ ok: false, message: 'אין תקשורת עם השרת. אפשר לשלוח מהטלפון האישי.' }); }
    finally { setSending(false); setConfirm(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } };
  return <div className="mt-2">
    <div className="flex flex-wrap gap-2 items-center">
      <button type="button" onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1 rounded-lg bg-green-600 text-white px-3 py-1.5 text-sm font-semibold hover:bg-green-700" aria-expanded={open}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3Z"/></svg>
        וואטסאפ להורה <span dir="ltr" className="font-normal opacity-90">0{intl.slice(3)}</span>
      </button>
      <span className="text-xs text-slate-500">בחירת תבנית ואז: פתיחה בוואטסאפ בטלפון שלך, או שליחה ישירה מהמערכת (מהמספר שלך או ממספר המרפאה).</span>
    </div>
    {open && <div className="mt-2 rounded-lg border bg-white p-3 space-y-2 text-sm">
      <div className="flex flex-wrap gap-2 items-center">
        <label className="font-semibold">תבנית</label>
        <select className="border rounded px-2 py-1 bg-white" value={id} onChange={e => pick(e.target.value)}>{TEMPLATES[clinic].map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select>
        <span className="mr-2 font-semibold">שפה</span>
        {(['he', 'ar'] as Lang[]).map(l => <button key={l} type="button" onClick={() => switchLang(l)} className={`rounded-full px-3 py-0.5 border ${lang === l ? 'bg-teal-700 text-white border-teal-700' : 'bg-white'}`}>{l === 'he' ? 'עברית' : 'ערבית'}</button>)}
      </div>
      <textarea className="w-full border rounded p-2 min-h-[7rem]" dir="auto" value={text} onChange={e => setCustom(e.target.value)} aria-label="נוסח ההודעה" />
      <div className="flex flex-wrap gap-2 items-center">
        <a href={href} target="_blank" rel="noreferrer" className="rounded-lg bg-green-600 text-white px-4 py-1.5 font-semibold hover:bg-green-700">פתיחה בוואטסאפ בטלפון</a>
        {!confirm
          ? <span className="inline-flex items-center gap-1">
              <select aria-label="מספר שולח" className="border rounded px-2 py-1.5 bg-white" value={sender} onChange={e => setSender(e.target.value as 'doctor' | 'clinic')}><option value="doctor">מהמספר שלי 050-995-5137</option><option value="clinic">ממספר המרפאה 054-349-6656</option></select>
              <button type="button" disabled={sending || sent?.ok} onClick={() => setConfirm(true)} className="rounded-lg bg-teal-700 text-white px-4 py-1.5 font-semibold hover:bg-teal-800 disabled:opacity-50">שליחה מהמערכת</button>
            </span>
          : <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-teal-700 bg-teal-50 px-3 py-1.5">
              <span>לשלוח עכשיו אל <b dir="ltr">0{intl.slice(3)}</b> מהמספר {SENDER_LOCAL[sender]}?</span>
              <button type="button" disabled={sending} onClick={sendFromInstitute} className="rounded bg-teal-700 text-white px-3 py-1 font-semibold disabled:opacity-50">{sending ? 'שולח…' : 'כן, לשלוח'}</button>
              <button type="button" disabled={sending} onClick={() => setConfirm(false)} className="underline">ביטול</button>
            </span>}
        <button type="button" onClick={copy} className="rounded-lg border px-3 py-1.5">{copied ? 'הועתק' : 'העתקת הנוסח'}</button>
        {custom !== null && <button type="button" onClick={() => setCustom(null)} className="text-slate-500 underline">חזרה לתבנית</button>}
      </div>
      {sent && <p role="status" className={`rounded p-2 text-sm ${sent.ok ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>{sent.message}</p>}
    </div>}
  </div>;
}
