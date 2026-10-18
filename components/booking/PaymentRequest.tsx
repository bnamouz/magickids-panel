'use client';
import { useState, type FormEvent } from 'react';
import type { BookingLanguage } from '@/lib/booking/copy';
import { paymentCopy } from '@/lib/booking/payment-copy';
import { PAYMENT, PRICES, withVat } from '@/lib/booking/payments';
import styles from './booking.module.css';

type Props = { language: BookingLanguage; visitType: 'assessment' | 'followup'; fund: 'clalit' | 'meuhedet' | 'leumit' | 'private'; labels: { child: string; patientId: string; parent: string; phone: string; institute: string }; };
const fmt = (n: number) => n.toLocaleString('en-US');

/** Non-Maccabi ADHD visits: show the fee and payment options, then collect the payment confirmation. */
export default function PaymentRequest({ language, visitType, fund, labels }: Props) {
  const p = paymentCopy[language];
  const [moxo, setMoxo] = useState(false);
  const [sending, setSending] = useState(false), [error, setError] = useState(''), [done, setDone] = useState('');
  const assessment = withVat(PRICES.assessment), moxoPrice = withVat(PRICES.moxo);
  const total = assessment + (moxo ? moxoPrice : 0);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; if (!form.reportValidity()) return;
    const data = new FormData(form);
    const file = data.get('proof');
    if (!(file instanceof File) || !file.size) { setError('invalid_proof'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('too_large'); return; }
    data.set('visitType', visitType); data.set('fund', fund); data.set('moxo', String(visitType === 'assessment' && moxo)); data.set('language', language);
    data.set('consent', data.get('consent') === 'on' ? 'true' : 'false');
    setSending(true); setError('');
    try {
      const r = await fetch('/api/booking/adhd/payment', { method: 'POST', body: data, cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.received) { setDone(j.reference); return; }
      setError(j.error || 'unavailable');
    } catch { setError('unavailable'); }
    finally { setSending(false); }
  }

  if (done) return <div className={styles.confirmation} role="status"><span className={styles.check} aria-hidden="true">✓</span><h2>{p.received}</h2><p>{p.receivedText}</p><div className={styles.receipt}><small>{p.funds[fund]}</small><code dir="ltr">{done}</code></div></div>;
  return <div>
    <h3 className={styles.step}><span>₪</span>{p.paidTitle}</h3>
    <p className={styles.muted}>{p.paidIntro}</p>
    {visitType === 'assessment' ? <>
      <table className={styles.priceTable}><tbody>
        <tr><td>{p.priceAssessment}</td><td>{fmt(assessment)} {p.currency}</td></tr>
        <tr><td><label className={styles.moxoPick}><input type="checkbox" checked={moxo} onChange={e => setMoxo(e.target.checked)} /><span>{p.priceMoxo}<small>{p.moxoOptional}</small></span></label></td><td>{moxo ? `${fmt(moxoPrice)} ${p.currency}` : '—'}</td></tr>
        <tr className={styles.total}><td>{p.total}</td><td>{fmt(total)} {p.currency}</td></tr>
      </tbody></table>
      <p className={styles.muted}>{p.vatNote}</p>
    </> : <p className={styles.fundNote}>{p.followupPrice}</p>}
    <h3 className={styles.step}><span>1</span>{p.methods}</h3>
    <div className={styles.methods}>
      <div><strong>{p.bank}</strong>{p.bankAccount}: <b dir="ltr">{PAYMENT.bankAccount}</b>{p.beneficiary}: {labels.institute}</div>
      <div><strong>{p.bit}</strong>{p.bitTo}: <b dir="ltr">{PAYMENT.bit}</b></div>
    </div>
    <p className={styles.muted}>{p.transferNote} {p.cardSoon}</p>
    <form onSubmit={submit}>
      <h3 className={styles.step}><span>2</span>{p.proof}</h3>
      <fieldset disabled={sending} className={styles.fields}>
        <div><span>{p.method}</span><div className={styles.radioRow}><label><input type="radio" name="method" value="bank" required />{p.bank}</label><label><input type="radio" name="method" value="bit" />{p.bit}</label></div></div>
        <label>{p.proof}<input name="proof" type="file" accept="image/jpeg,image/png,application/pdf" required /></label>
        <label>{labels.child}<input name="childName" required minLength={2} maxLength={100} autoComplete="off" /></label>
        <label>{labels.patientId}<input name="childId" inputMode="numeric" dir="ltr" required minLength={9} maxLength={9} pattern="[0-9]{9}" autoComplete="off" /></label>
        <label>{labels.parent}<input name="parentName" required minLength={2} maxLength={100} autoComplete="name" /></label>
        <label>{labels.phone}<input name="phone" type="tel" dir="ltr" required minLength={7} maxLength={25} autoComplete="tel" /></label>
        <div className={styles.honeypot} aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label></div>
        <label className={styles.consent}><input type="checkbox" name="consent" required /><span>{p.consent}</span></label>
      </fieldset>
      {error && <p role="alert" className={styles.error}>{p.errors[error] ?? ( (language === 'en' ? 'Could not send right now. Please try again or contact the secretary.' : language === 'ar' ? 'تعذّر الإرسال حاليًا. حاولوا مرة أخرى أو تواصلوا مع السكرتارية.' : 'לא ניתן לשלוח כרגע. נסו שוב או פנו למזכירות.'))}</p>}
      <button type="submit" disabled={sending} className={styles.primary}>{sending ? p.sending : p.submit}</button>
    </form>
  </div>;
}
