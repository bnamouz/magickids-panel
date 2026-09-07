'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { bookingCopy, type BookingLanguage } from '@/lib/booking/copy';
import { localParts, TIME_ZONE, type Clinic } from '@/lib/booking/schedule';
import styles from './booking.module.css';

type Confirmation = { confirmed: true; clinic: Clinic; start: string; durationMinutes: number; reference: string };
const origin = 'https://magickidsinstitute.com';
function extractToken(value: string) {
  const trimmed = value.trim();
  if (/^[0-9a-f-]{36}$/i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || url.hostname !== 'app.magickidsinstitute.com') return '';
    return url.pathname.match(/^\/questionnaire\/parent\/([0-9a-f-]{36})\/?$/i)?.[1] ?? '';
  } catch { return ''; }
}
export default function BookingPage({ clinic, initialLanguage }: { clinic: Clinic; initialLanguage: BookingLanguage }) {
  const [language, setLanguage] = useState(initialLanguage);
  const t = bookingCopy[language];
  const locale = language === 'he' ? 'he-IL' : language === 'ar' ? 'ar-IL' : 'en-GB';
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState(() => localParts(new Date()).date.slice(0, 7));
  const [start, setStart] = useState('');
  const [intakeLink, setIntakeLink] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const retryBody = useRef<Record<string, unknown> | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setUnavailable(false);
    try {
      const response = await fetch(`/api/booking/${clinic}`, { cache: 'no-store', signal });
      const data = await response.json();
      if (!response.ok || data.clinic !== clinic || !Array.isArray(data.slots)) throw new Error();
      setSlots(data.slots);
      setStart('');
      if (data.slots[0]) { const first = localParts(new Date(data.slots[0])).date; setDay(first); setMonth(first.slice(0, 7)); }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setSlots([]); setUnavailable(true);
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [clinic]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (token && clinic === 'adhd') {
      setIntakeLink(token);
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [clinic]);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'en' ? 'ltr' : 'rtl';
    document.title = `${t[clinic]} | ${t.institute}`;
    const current = new URL(window.location.href); current.searchParams.set('lang', language);
    history.replaceState(null, '', current.pathname + current.search);
  }, [language, clinic, t]);

  const days = [...new Set(slots.map(slot => localParts(new Date(slot)).date))];
  const times = slots.filter(slot => localParts(new Date(slot)).date === day);
  const monthStart = new Date(`${month}-01T12:00:00Z`);
  const monthLength = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
  const months = [...new Set(days.map(date => date.slice(0, 7)))];
  const monthIndex = months.indexOf(month);
  const displayTime = (iso: string) => new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  const displayDate = (iso: string) => new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
  const errorText = t.errors[error as keyof typeof t.errors] ?? t.errors.unavailable;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!uncertain && (!form.reportValidity() || !start)) return;
    const fields = new FormData(form);
    const token = extractToken(intakeLink);
    if (clinic === 'adhd' && !token) { setError('invalid_intake'); return; }
    const body = retryBody.current ?? {
      requestId: crypto.randomUUID(), start,
      childName: String(fields.get('childName') ?? '').trim(), parentName: String(fields.get('parentName') ?? '').trim(),
      phone: String(fields.get('phone') ?? '').trim(), consent: fields.get('consent') === 'on', website: String(fields.get('website') ?? ''),
      ...(clinic === 'adhd' ? { parentToken: token } : {}),
    };
    retryBody.current = body;
    setSending(true); setError('');
    try {
      const response = await fetch(`/api/booking/${clinic}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
      const result = await response.json();
      if (response.ok && result.confirmed === true && result.clinic === clinic && result.reference === body.requestId) {
        setConfirmation(result); setUncertain(false); retryBody.current = null; return;
      }
      const code = result.error || 'processing';
      setError(code);
      const pending = code === 'processing' || response.status >= 500;
      setUncertain(pending);
      if (!pending) retryBody.current = null;
      if (code === 'slot_taken' || code === 'invalid_slot') { setStart(''); void load(); }
    } catch { setError('processing'); setUncertain(true); }
    finally { setSending(false); }
  }
  return <div className={styles.page} dir={language === 'en' ? 'ltr' : 'rtl'} lang={language}>
    <header className={styles.header}>
      <a className={styles.brand} href={`${origin}/index.html?lang=${language}`}><img src={`${origin}/assets/institute-logo.jpg`} alt="" width="56" height="56" /><span>{t.institute}<small>MAGIC KIDS INSTITUTE</small></span></a>
      <div className={styles.languages} role="group" aria-label={t.language}>{(['ar', 'he', 'en'] as const).map(lang => <button type="button" key={lang} lang={lang} aria-pressed={language === lang} onClick={() => setLanguage(lang)}>{lang === 'ar' ? 'العربية' : lang === 'he' ? 'עברית' : 'EN'}</button>)}</div>
    </header>
    <main className={styles.main}>
      <aside className={styles.intro}>
        <span className={styles.eyebrow}>{t[clinic]}</span><h1>{t.heading}</h1><p>{t.intro}</p>
        <div className={styles.doctor}><img src={`${origin}/assets/doctor.jpg`} alt={t.doctor} width="80" height="95" /><div><strong>{t.doctor}</strong><span>{t.institute}</span></div></div>
        <div className={styles.address}><span aria-hidden="true">⌖</span> {t.address}</div>
        <a href="tel:+972544020043" className={styles.phone}>{t.contact}<b dir="ltr">054-402-0043</b></a>
        <a className={styles.home} href={`${origin}/index.html?lang=${language}`}>{t.home} ↗</a>
      </aside>
      <section className={styles.panel} aria-label={t.available}>
        {!confirmation && <><nav className={styles.clinics} aria-label={t.available}>{(['pediatrics', 'adhd'] as const).map(value => <a key={value} aria-current={value === clinic ? 'page' : undefined} href={`/book/${value}?lang=${language}`}>{t[value]}</a>)}</nav><h2>{t[clinic]}</h2><p className={styles.muted}>{clinic === 'adhd' ? t.adhdIntro : t.pedsIntro}</p></>}
        {confirmation ? <div className={styles.confirmation} role="status"><span className={styles.check} aria-hidden="true">✓</span><h2>{t.confirmed}</h2><p>{t.saved}</p><div className={styles.receipt}><h3>{t[confirmation.clinic]}</h3><strong>{displayDate(confirmation.start)}</strong><b>{displayTime(confirmation.start)}</b><p>{t.address}</p><small>{t.reference}</small><code dir="ltr">{confirmation.reference}</code></div><p>{t.change}</p><a className={styles.primary} href={`${origin}/index.html?lang=${language}`}>{t.another}</a></div> : loading ? <p role="status" className={styles.notice}>{t.loading}</p> : unavailable || !slots.length ? <div className={styles.notice} role="status"><p>{unavailable ? t.unavailable : t.empty}</p><button type="button" onClick={() => void load()}>{t.retry}</button><a href="tel:+972544020043" dir="ltr">054-402-0043</a></div> : <>
          <h3 className={styles.step}><span>1</span>{t.step1}</h3>
          <div className={styles.calendar}>
            <div className={styles.month}><button type="button" aria-label={t.previous} disabled={monthIndex <= 0 || uncertain || sending} onClick={() => setMonth(months[monthIndex - 1])}>‹</button><strong>{new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(monthStart)}</strong><button type="button" aria-label={t.next} disabled={monthIndex < 0 || monthIndex >= months.length - 1 || uncertain || sending} onClick={() => setMonth(months[monthIndex + 1])}>›</button></div>
            <div className={styles.week}>{Array.from({ length: 7 }, (_, i) => <span key={i}>{new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 8, 6 + i)))}</span>)}</div>
            <div className={styles.days}>{Array.from({ length: monthStart.getUTCDay() }, (_, i) => <span key={`empty-${i}`} />)}{Array.from({ length: monthLength }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, '0')}`;
              return <button type="button" key={date} disabled={!days.includes(date) || uncertain || sending} aria-pressed={day === date} aria-label={displayDate(`${date}T12:00:00Z`)} onClick={() => { setDay(date); setStart(''); setError(''); }}>{i + 1}</button>;
            })}</div>
          </div>
          <h3 className={styles.step}><span>2</span>{t.step2}</h3><p className={styles.muted}>{day ? displayDate(`${day}T12:00:00Z`) : t.chooseDay} · {t.timezone}</p>
          <div className={styles.times}>{times.map(slot => <button type="button" key={slot} disabled={uncertain || sending} aria-pressed={start === slot} onClick={() => { setStart(slot); setError(''); }}>{displayTime(slot)}</button>)}</div>
          <form onSubmit={submit}>
            <h3 className={styles.step}><span>3</span>{t.step3}</h3>
            <fieldset disabled={sending || uncertain} className={styles.fields}>
              {clinic === 'adhd' && <div className={styles.intake}><label>{t.intake}<input type="text" autoComplete="off" dir="ltr" value={intakeLink} onChange={event => setIntakeLink(event.target.value)} required maxLength={300} /></label><p>{t.intakeHint}</p><p>{t.newFamily} <a href="/register">{t.register}</a></p></div>}
              <label>{t.child}<input name="childName" required minLength={2} maxLength={100} autoComplete="off" /></label><label>{t.parent}<input name="parentName" required minLength={2} maxLength={100} autoComplete="name" /></label><label>{t.phone}<input name="phone" type="tel" dir="ltr" autoComplete="tel" required minLength={7} maxLength={25} /></label>
              <div className={styles.honeypot} aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
              <label className={styles.consent}><input type="checkbox" name="consent" required /><span>{t.consent}</span></label><p className={styles.muted}>{t.noMedical}</p>
            </fieldset>
            {error && <p role="alert" className={styles.error}>{errorText}</p>}
            {start && <div className={styles.selection}><strong>{t[clinic]}</strong><span>{displayDate(start)} · {displayTime(start)}</span></div>}
            <button type="submit" disabled={!start || sending} className={styles.primary}>{sending ? t.submitting : t.submit}</button>
          </form>
        </>}
      </section>
    </main>
    <footer className={styles.footer}><span>{t.institute} · {t.address}</span><a href="mailto:magickids@magickidsinstitute.com" dir="ltr">magickids@magickidsinstitute.com</a></footer>
  </div>;
}
