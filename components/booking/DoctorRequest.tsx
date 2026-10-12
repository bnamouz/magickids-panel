'use client';
import { useRef, useState, type FormEvent } from 'react';
import type { BookingLanguage } from '@/lib/booking/copy';
import { bookingLocale } from '@/lib/booking/format';
import styles from './booking.module.css';
const copy = {
 he:{title:'בקשה מהרופא ללא תור',note:'לבקשות שאינן דחופות בלבד. הבקשה תופיע ביומן המרפאה היום או ביום הפעילות הבא. שליחת בקשה אינה קביעת תור ואין התחייבות לזמן מענה.',child:'שם הילד/ה',parent:'שם ההורה',phone:'טלפון לחזרה',message:'מה תרצו לבקש מהרופא?',consent:'אני מאשר/ת להעביר את הפרטים ואת הבקשה לצוות המרפאה.',send:'שליחת בקשה לרופא',sending:'שולח…',retry:'ניסיון חוזר לאותה בקשה',error:'לא התקבל אישור שמירה. אפשר לנסות שוב כאן עם אותם פרטים כדי למנוע כפילות.',limited:'נשלחו כמה בקשות בזמן קצר. נסו שוב מאוחר יותר או צרו קשר עם המרפאה.',invalid:'בדקו שהפרטים מלאים ומספר הטלפון תקין.',closed:'הבקשה הקודמת נסגרה על ידי המרפאה. צרו קשר עם המרפאה לבירור.',success:'הבקשה נשמרה ביומן המרפאה. לא נקבע תור.',day:'תאריך הבקשה ביומן',reference:'אסמכתא'},
 ar:{title:'طلب من الطبيب دون حجز موعد',note:'للطلبات غير العاجلة فقط. يظهر الطلب في تقويم العيادة اليوم أو في يوم العمل التالي. إرسال الطلب لا يحجز موعدًا ولا يضمن وقتًا محددًا للرد.',child:'اسم الطفل/ة',parent:'اسم ولي الأمر',phone:'رقم الهاتف للتواصل',message:'ما هو طلبكم من الطبيب؟',consent:'أوافق على إرسال التفاصيل والطلب إلى طاقم العيادة.',send:'إرسال الطلب للطبيب',sending:'جارٍ الإرسال…',retry:'إعادة محاولة إرسال نفس الطلب',error:'لم يصل تأكيد الحفظ. يمكن إعادة المحاولة هنا بنفس التفاصيل لتجنب التكرار.',limited:'تم إرسال عدة طلبات خلال فترة قصيرة. حاولوا لاحقًا أو اتصلوا بالعيادة.',invalid:'تأكدوا من تعبئة التفاصيل وصحة رقم الهاتف.',closed:'أغلقت العيادة الطلب السابق. يرجى التواصل معها للاستفسار.',success:'حُفظ الطلب في تقويم العيادة. لم يُحجز موعد.',day:'تاريخ الطلب في التقويم',reference:'رقم الطلب'},
 en:{title:'Request from the doctor without an appointment',note:'For non-urgent requests only. Your request appears in the clinic calendar today or on the next working day. This does not book an appointment or guarantee a response time.',child:'Child’s name',parent:'Parent’s name',phone:'Contact phone',message:'What would you like to request?',consent:'I agree to share these details and this request with the clinic team.',send:'Send request to the doctor',sending:'Sending…',retry:'Retry this same request',error:'Saving has not been confirmed. Retry here with the same details to avoid duplicates.',limited:'Several requests were sent recently. Try later or contact the clinic.',invalid:'Check that all details and the phone number are correct.',closed:'The clinic closed the previous request. Contact the clinic for assistance.',success:'Your request was saved in the clinic calendar. No appointment was booked.',day:'Calendar date',reference:'Reference'},
};
type Payload={requestId:string;childName:string;parentName:string;phone:string;message:string;consent:boolean;website:string;language:BookingLanguage};
export default function DoctorRequest({language}:{language:BookingLanguage}) {
 const t=copy[language];
 const [pending,setPending]=useState(false);
 const [retry,setRetry]=useState<Payload|null>(null);
 const [error,setError]=useState('');
 const [receipt,setReceipt]=useState<{reference:string;calendarDay:string}|null>(null);
 const inFlight=useRef(false);
 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();if(inFlight.current)return;
  const form=new FormData(event.currentTarget);
  const body=retry??{requestId:crypto.randomUUID(),childName:String(form.get('childName')??''),parentName:String(form.get('parentName')??''),phone:String(form.get('phone')??''),message:String(form.get('message')??''),consent:form.get('consent')==='on',website:String(form.get('website')??''),language};
  inFlight.current=true;setPending(true);setError('');setRetry(body);
  try {
   const response=await fetch('/api/booking/doctor-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const result=await response.json();
   if(!response.ok||result.received!==true){
    if(response.status===400){setRetry(null);setError('invalid');}
    else setError(response.status===429?'limited':result.error==='request_closed'?'closed':'error');
    return;
   }
   setReceipt(result);
  }catch{setError('error');}finally{inFlight.current=false;setPending(false);}
 }
 return <details className={styles.doctorRequest}><summary>{t.title}</summary><p>{t.note}</p>
 {receipt?<div role="status" className={styles.receipt}><strong>{t.success}</strong><p>{t.day}: {new Date(receipt.calendarDay+'T12:00:00Z').toLocaleDateString(bookingLocale(language),{dateStyle:'full',timeZone:'Asia/Jerusalem'})}</p><small>{t.reference}</small><code dir="ltr">{receipt.reference}</code></div>:<form onSubmit={submit}>
 <fieldset className={styles.fields} disabled={pending||!!retry}>
 <label>{t.child}<input name="childName" required minLength={2} maxLength={100} autoComplete="off"/></label>
 <label>{t.parent}<input name="parentName" required minLength={2} maxLength={100} autoComplete="name"/></label>
 <label>{t.phone}<input name="phone" type="tel" dir="ltr" required minLength={7} maxLength={25} autoComplete="tel"/></label>
 <label>{t.message}<textarea name="message" required minLength={5} maxLength={1000} rows={4}/></label>
 <label className={styles.honeypot} aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off"/></label>
 <label className={styles.consent}><input name="consent" type="checkbox" required/>{t.consent}</label>
 </fieldset>
 {error&&<p role="alert" className={styles.error}>{t[error as 'error'|'limited'|'invalid'|'closed']}</p>}
 <button className={styles.primary} disabled={pending||error==='closed'}>{pending?t.sending:retry?t.retry:t.send}</button>
 </form>}</details>;
}
