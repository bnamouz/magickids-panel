'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './booking.module.css';
const copy = {
 he: { title: 'ביטול תור במרפאת הילדים', intro: 'ביטול עצמי ללא אישור המזכירות. הפעולה תתבצע רק לאחר לחיצה על כפתור הביטול.', cancel: 'כן, לבטל את התור', done: 'התור בוטל והשעה שוחררה.', error: 'לא ניתן להשלים את הפעולה. נסו שוב או פנו למרפאה עם מספר ההזמנה.', loading: 'בודקים את התור…', save: 'לשמור את התור', retry: 'בדיקה מחדש' },
 ar: { title: 'إلغاء موعد في عيادة الأطفال', intro: 'إلغاء ذاتي دون موافقة السكرتارية. يُلغى الموعد فقط بعد الضغط على زر الإلغاء.', cancel: 'نعم، إلغاء الموعد', done: 'تم إلغاء الموعد وإتاحة الوقت مجددًا.', error: 'تعذّر إكمال العملية. حاولوا مجددًا أو تواصلوا مع العيادة مع رقم الحجز.', loading: 'جارٍ التحقق من الموعد…', save: 'الاحتفاظ بالموعد', retry: 'المحاولة مجددًا' },
 en: { title: 'Cancel a pediatrics appointment', intro: 'No secretary approval is needed. Your appointment is cancelled only when you press the cancel button.', cancel: 'Yes, cancel my appointment', done: 'Your appointment is cancelled and the slot has been released.', error: 'We could not complete this action. Retry or contact the clinic with your reference.', loading: 'Checking your appointment…', save: 'Keep my appointment', retry: 'Retry' },
};
export default function CancelBooking({ language }: { language: keyof typeof copy }) {
 const t = copy[language]; const loaded = useRef(false);
 const [link, setLink] = useState<{id: string; token: string} | null>(null);
 const [state, setState] = useState('loading'); const [start, setStart] = useState('');
 useEffect(() => { if (loaded.current) return; loaded.current = true; const hash = new URLSearchParams(location.hash.slice(1)); const value = { id: hash.get('id') ?? '', token: hash.get('token') ?? '' }; setLink(value); history.replaceState(null, '', location.pathname + location.search); void run(value, true); }, []);
 async function run(value: {id: string; token: string}, preview: boolean) {
  setState('loading');
  try { const response = await fetch('/api/booking/cancel', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...value, preview}) }); const data = await response.json(); if (!response.ok) throw new Error(); setStart(data.start ?? ''); setState(data.cancelled ? 'done' : 'ready'); }
  catch { setState('error'); }
 }
 return <main className={styles.page} dir={language === 'en' ? 'ltr' : 'rtl'} lang={language}><section className={styles.panel} style={{maxWidth: 640, margin: '40px auto'}}><h1>{t.title}</h1><p>{t.intro}</p>{state === 'loading' ? <p role="status">{t.loading}</p> : state === 'done' ? <p role="status">{t.done}</p> : state === 'error' ? <><p role="alert">{t.error}</p><button onClick={() => link && run(link, true)}>{t.retry}</button><a href="tel:+972543496656" dir="ltr">054-349-6656</a></> : <><p>{start && new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : `${language}-IL`, {timeZone:'Asia/Jerusalem',dateStyle:'full',timeStyle:'short'}).format(new Date(start))}</p><button className={styles.primary} onClick={() => link && run(link, false)}>{t.cancel}</button></>}<p><a href={`https://magickidsinstitute.com/index.html?lang=${language}`}>{t.save}</a></p></section></main>;
}
