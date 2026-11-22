'use client';
import { useRef, useState, type FormEvent } from 'react';
import { nationalIdSchema } from '@/lib/shared/national-id';
import { FUNDS, PAYMENT } from '@/lib/booking/payments';
import { FUND_LABELS, renewalCopy, type RenewalLanguage } from '@/lib/prescriptions/copy';
import { MAX_SUMMARY_FILES, MAX_TOTAL_BYTES, RENEWAL_BASE, RENEWAL_MONTHS, RENEWAL_PRICE, type RenewalMonths } from '@/lib/prescriptions/pricing';

const WHATSAPP = 'https://wa.me/972544020043';
const field = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3 text-base focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/30';
const fileField = `${field} file:me-3 file:rounded-md file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:font-semibold file:text-teal-900`;

/** Phone photos are several megabytes; one request must stay under the platform's body limit. PDFs pass as they are. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if ((file.type === 'image/jpeg' || file.type === 'image/png') && file.size <= 600_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/jpeg', 0.82));
    return blob ? new File([blob], file.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}
const acceptable = (f: File) => ['image/jpeg', 'image/png', 'application/pdf'].includes(f.type);

export default function RenewalForm({ language, enabled }: { language: RenewalLanguage; enabled: boolean }) {
  const t = renewalCopy[language], funds = FUND_LABELS[language];
  const requestId = useRef<string>('');
  const summaryBox = useRef<HTMLElement>(null);
  const [months, setMonths] = useState<RenewalMonths>(1);
  const [stage, setStage] = useState<'' | 'preparing' | 'sending'>('');
  const [error, setError] = useState<keyof typeof t.errors | ''>('');
  const [needSummary, setNeedSummary] = useState(false);
  const [done, setDone] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget; if (!form.reportValidity()) return;
    const raw = new FormData(form);
    const proof = raw.get('proof'), summaries = raw.getAll('summary').filter((f): f is File => f instanceof File && f.size > 0);
    if (!(proof instanceof File) || !proof.size) { setError('invalid_file'); return; }
    if (summaries.length > MAX_SUMMARY_FILES) { setError('too_many'); return; }
    setError(''); setStage('preparing');
    try {
      const files = await Promise.all([proof, ...summaries].map(shrink));
      if (!files.every(acceptable)) { setError('invalid_file'); return; }
      if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES) { setError('too_large'); return; }
      requestId.current ||= crypto.randomUUID();
      const data = new FormData();
      for (const name of ['patientName', 'nationalId', 'birthDate', 'contactName', 'phone', 'fund', 'medication', 'note', 'method', 'website']) data.set(name, String(raw.get(name) ?? ''));
      data.set('id', requestId.current); data.set('months', String(months)); data.set('language', language); data.set('consent', raw.get('consent') === 'on' ? 'true' : 'false');
      data.set('proof', files[0]); for (const f of files.slice(1)) data.append('summary', f);
      setStage('sending');
      const r = await fetch('/api/prescriptions', { method: 'POST', body: data, cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.received) { setDone(String(j.reference).slice(0, 8).toUpperCase()); return; }
      if (j.error === 'summary_required') { setNeedSummary(true); setTimeout(() => summaryBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); return; }
      if (j.error === 'duplicate') requestId.current = '';
      setError(r.status === 413 ? 'too_large' : j.error in t.errors ? j.error : 'unavailable');
    } catch { setError('unavailable'); }
    finally { setStage(''); }
  }

  const heading = (n: number, text: string) => <h2 className="flex items-center gap-3 text-xl font-bold text-teal-900"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-base text-white" aria-hidden="true">{n}</span>{text}</h2>;
  const busy = stage !== '';
  return <div className="card mx-auto max-w-2xl" dir={language === 'en' ? 'ltr' : 'rtl'} lang={language}>
    <nav aria-label="Language" className="mb-3 flex gap-3 text-sm">{(['ar', 'he', 'en'] as const).map(l => <a key={l} href={`/prescription?lang=${l}`} aria-current={l === language ? 'page' : undefined} className={l === language ? 'font-bold text-teal-900' : 'text-teal-800 underline'}>{{ ar: 'العربية', he: 'עברית', en: 'English' }[l]}</a>)}</nav>
    <h1 className="text-3xl font-bold text-teal-800">{t.title}</h1>
    <p className="my-4 text-slate-800">{t.intro}</p>
    <p className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 font-semibold text-amber-950">{t.doctorNote}</p>
    {!enabled ? <p role="status" className="rounded-lg bg-amber-50 p-4">{t.errors.inactive}</p>
      : done ? <div role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-5"><h2 className="text-2xl font-bold text-teal-900">{t.doneTitle}</h2><p className="my-3">{t.doneText}</p><p className="text-sm text-slate-700">{t.reference}: <code dir="ltr" className="font-bold">{done}</code></p></div>
      : <form onSubmit={submit} className="space-y-8" noValidate={false}>
        <fieldset disabled={busy} className="space-y-8">
          <section className="space-y-3">{heading(1, t.stepPeriod)}
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t.stepPeriod}>{RENEWAL_MONTHS.map(m => <label key={m} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 p-4 ${months === m ? 'border-teal-700 bg-teal-50' : 'border-slate-200 bg-white'}`}>
              <span className="flex items-center gap-3"><input type="radio" name="months" value={m} checked={months === m} onChange={() => setMonths(m)} className="h-5 w-5 accent-teal-700" /><span className="font-semibold">{m === 1 ? t.oneMonth : t.threeMonths}<small className="block font-normal text-slate-600"><span dir="ltr">{RENEWAL_BASE[m]}</span> {t.plusVat}</small></span></span>
              <b className="whitespace-nowrap text-xl text-teal-900" dir="ltr">{RENEWAL_PRICE[m]} {t.currency}</b>
            </label>)}</div>
            <p className="text-sm text-slate-600">{t.vatNote}</p>
          </section>

          <section className="space-y-4">{heading(2, t.stepPatient)}
            <label className="block">{t.patient}<input className={field} name="patientName" required minLength={2} maxLength={100} autoComplete="off" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">{t.nationalId}<input className={field} name="nationalId" required type="text" inputMode="numeric" dir="ltr" minLength={9} maxLength={9} pattern="[0-9٠-٩۰-۹]{9}" autoComplete="off" onInput={e => e.currentTarget.setCustomValidity(nationalIdSchema.safeParse(e.currentTarget.value).success ? '' : t.idError)} /></label>
              <label className="block">{t.birth}<input className={field} name="birthDate" required type="date" min="1920-01-01" max={today} /></label>
            </div>
            <label className="block">{t.fund}<select className={field} name="fund" required defaultValue=""><option value="" disabled>—</option>{FUNDS.map(f => <option key={f} value={f}>{funds[f]}</option>)}</select></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">{t.contact}<input className={field} name="contactName" required minLength={2} maxLength={100} autoComplete="name" /><small className="mt-1 block text-slate-600">{t.contactHint}</small></label>
              <label className="block">{t.phone}<input className={field} name="phone" required type="tel" dir="ltr" minLength={9} maxLength={20} autoComplete="tel" placeholder="05X-XXXXXXX" /></label>
            </div>
          </section>

          <section className="space-y-4">{heading(3, t.stepTreatment)}
            <label className="block">{t.medication}<input className={field} name="medication" required minLength={2} maxLength={200} autoComplete="off" /><small className="mt-1 block text-slate-600">{t.medicationHint}</small></label>
            <label className="block">{t.note}<textarea className={field} name="note" rows={3} maxLength={500} /></label>
          </section>

          <section ref={summaryBox} className={`space-y-3 rounded-xl ${needSummary ? 'border-2 border-red-400 bg-red-50 p-4' : ''}`}>{heading(4, t.stepSummary)}
            {needSummary ? <p role="alert" className="font-semibold text-red-800">{t.summaryRequired}</p> : <p className="text-slate-700">{t.summaryIntro}</p>}
            <label className="block">{t.summary}<input className={fileField} name="summary" type="file" multiple accept="image/*,application/pdf" required={needSummary} /></label>
          </section>

          <section className="space-y-4">{heading(5, t.stepPayment)}
            <p className="text-slate-700">{t.payIntro}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><strong className="block text-teal-900">{t.bank}</strong>{t.bankAccount}: <b dir="ltr">{PAYMENT.bankAccount}</b><br />{t.beneficiary}: {t.institute}</div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><strong className="block text-teal-900">{t.bit}</strong>{t.bitTo}: <b dir="ltr">{PAYMENT.bit}</b></div>
            </div>
            <p className="flex items-center justify-between rounded-lg bg-teal-700 px-4 py-3 text-lg font-bold text-white"><span>{t.total}</span><span dir="ltr">{RENEWAL_PRICE[months]} {t.currency}</span></p>
            <fieldset><legend className="mb-1">{t.method}</legend><div className="flex flex-wrap gap-5">{(['bank', 'bit'] as const).map(m => <label key={m} className="flex items-center gap-2 py-2"><input type="radio" name="method" value={m} required className="h-5 w-5 accent-teal-700" />{m === 'bank' ? t.bank : t.bit}</label>)}</div></fieldset>
            <label className="block">{t.proof}<input className={fileField} name="proof" type="file" required accept="image/*,application/pdf" /></label>
          </section>

          <label className="flex items-start gap-3"><input name="consent" type="checkbox" required className="mt-1 h-5 w-5 shrink-0 accent-teal-700" /><span>{t.consent}</span></label>
          <input name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" defaultValue="" />
        </fieldset>
        {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 font-semibold text-red-800">{t.errors[error]}</p>}
        <button disabled={busy} className="btn-primary w-full text-lg" type="submit">{stage === 'preparing' ? t.preparing : stage === 'sending' ? t.sending : t.submit}</button>
      </form>}
    <a className="mt-6 block text-teal-800 underline" href={WHATSAPP} target="_blank" rel="noopener noreferrer">{t.contactUs}</a>
  </div>;
}
