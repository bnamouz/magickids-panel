'use client';
import { useState } from 'react';
import { candidateSlots, localParts, TIME_ZONE } from '@/lib/booking/schedule';
import type { BookingLanguage } from '@/lib/booking/copy';
import styles from './booking.module.css';
const copy = {
 he: { title: 'בקשת תור בשעות העבודה', note: 'בחרו יום ושעה מועדפים מתוך שעות העבודה הרגילות. אלו אינם תורים פנויים מאומתים. הבקשה תישלח רק לאחר שתשלחו את ההודעה ב־WhatsApp; התור נקבע רק לאחר אישור המרפאה. ייתכנו שינויים בחגים.', day: 'יום מועדף', time: 'שעה מועדפת — שעון ישראל', choose: 'בחירה', send: 'פתיחת בקשת תור ב־WhatsApp', message: 'שלום, אשמח לבקש תור למרפאת הילדים במועד הבא (שעון ישראל):', pending: 'אבקש אישור זמינות ותיאום. ידוע לי שעדיין לא נקבע תור.' },
 ar: { title: 'طلب موعد خلال ساعات العمل', note: 'اختاروا يومًا ووقتًا مفضّلين ضمن ساعات العمل المعتادة. هذه ليست مواعيد شاغرة مؤكدة. يُرسل الطلب فقط بعد إرسال الرسالة في واتساب، ولا يُحجز الموعد إلا بعد تأكيد العيادة. قد تتغير الساعات في الأعياد.', day: 'اليوم المفضّل', time: 'الوقت المفضّل — توقيت إسرائيل', choose: 'اختيار', send: 'فتح طلب موعد في واتساب', message: 'مرحبًا، أرغب بطلب موعد في عيادة الأطفال في الوقت التالي (توقيت إسرائيل):', pending: 'يرجى تأكيد التوفر والتنسيق. أعلم أنه لم يُحجز موعد بعد.' },
 en: { title: 'Request an appointment during opening hours', note: 'Choose a preferred day and time within regular opening hours. These are not verified available appointments. Your request is sent only when you send the WhatsApp message; booking requires clinic confirmation. Holiday hours may differ.', day: 'Preferred day', time: 'Preferred time — Israel time', choose: 'Choose', send: 'Open appointment request in WhatsApp', message: 'Hello, I would like to request a pediatrics appointment at the following time (Israel time):', pending: 'Please confirm availability and arrange the appointment. I understand no appointment has been booked yet.' },
};
export default function WorkdayRequest({ language }: { language: BookingLanguage }) {
 const t = copy[language];
 const [day, setDay] = useState('');
 const [time, setTime] = useState('');
 const candidates = candidateSlots('pediatrics');
 const days = [...new Set(candidates.map(value => localParts(new Date(value)).date))];
 const times = candidates.filter(value => localParts(new Date(value)).date === day);
 const locale = language === 'en' ? 'en-GB' : `${language}-IL`;
 const dateLabel = (value: string) => new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
 const timeLabel = (value: string) => new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
 const valid = times.includes(time);
 const message = valid ? `${t.message}\n${dateLabel(time)} ${timeLabel(time)}\n${t.pending}` : '';
 return <section aria-labelledby="request-title"><h3 id="request-title">{t.title}</h3><p>{t.note}</p><div className={styles.fields}>
 <label>{t.day}<select value={days.includes(day) ? day : ''} onChange={event => { setDay(event.target.value); setTime(''); }}><option value="">{t.choose}</option>{days.map(value => <option key={value} value={value}>{dateLabel(`${value}T12:00:00Z`)}</option>)}</select></label>
 <label>{t.time}<select value={valid ? time : ''} disabled={!days.includes(day)} onChange={event => setTime(event.target.value)}><option value="">{t.choose}</option>{times.map(value => <option key={value} value={value}>{timeLabel(value)}</option>)}</select></label>
 </div>{valid && <a className={styles.primary} href={`https://wa.me/972543496656?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">{t.send}</a>}</section>;
}
