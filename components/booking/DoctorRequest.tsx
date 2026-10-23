'use client';
import { useRef, useState, type FormEvent } from 'react';
import type { BookingLanguage } from '@/lib/booking/copy';
import { bookingLocale } from '@/lib/booking/format';
import styles from './booking.module.css';
import { paymentCopy } from '@/lib/booking/payment-copy';
import { FUNDS, type Fund } from '@/lib/booking/payments';
// ADHD clinic: same request mechanism; the stated health fund decides whether the Maccabi cardless declaration applies.
const adhdCopy = {
 he:{note:'לבקשות שאינן דחופות בלבד. הבקשה תופיע ביומן מרפאת הקשב והריכוז בתאריך שבו נשלחה, ותטופל ביום הפעילות הקרוב של המרפאה. שליחת בקשה אינה קביעת תור ואין התחייבות לזמן מענה.',fund:'קופת חולים',choose:'בחרו קופה',invalid:'בדקו שהפרטים מלאים, שבחרתם קופה, שתעודת הזהות כוללת 9 ספרות ושמספר הטלפון תקין. למטופלי מכבי יש לסמן אישור ביקור ללא כרטיס.'},
 ar:{note:'للطلبات غير العاجلة فقط. يظهر الطلب في تقويم عيادة الانتباه والتركيز بتاريخ إرساله، وتتم معالجته في أقرب يوم عمل للعيادة. إرسال الطلب لا يحجز موعدًا ولا يضمن وقتًا محددًا للرد.',fund:'صندوق المرضى',choose:'اختاروا الصندوق',invalid:'تأكدوا من تعبئة التفاصيل واختيار الصندوق ورقم الهوية من 9 أرقام وصحة الهاتف. لمؤمَّني مكابي يجب وضع علامة على تأكيد زيارة بدون بطاقة.'},
 en:{note:'For non-urgent requests only. Your request appears in the ADHD clinic calendar on the date it was sent and is handled on the clinic’s next working day. This does not book an appointment or guarantee a response time.',fund:'Health fund',choose:'Choose a fund',invalid:'Check all details, the health fund, the 9-digit ID and phone number. Maccabi patients must confirm the cardless visit authorization.'},
};
const copy = {
 he:{badge:'שירות חדש',childId:'תעודת זהות הילד/ה — 9 ספרות כולל אפסים בתחילת המספר',cardless:'בוצע אישור ביקור ללא כרטיס עבור הילד/ה',cardlessHelp:'יש לבצע אישור ביקור ללא כרטיס ולסמן לאחר שבוצע. הסימון הוא הצהרת ההורה ואינו אימות מול מכבי.',title:'בקשה מהרופא ללא תור',note:'לבקשות שאינן דחופות בלבד. הבקשה תופיע ביומן המרפאה בתאריך שבו נשלחה, ותטופל ביום הפעילות הקרוב. שליחת בקשה אינה קביעת תור ואין התחייבות לזמן מענה.',child:'שם הילד/ה',parent:'שם ההורה',phone:'טלפון לחזרה',message:'מה תרצו לבקש מהרופא?',consent:'אני מאשר/ת להעביר את הפרטים ואת הבקשה לצוות המרפאה.',send:'שליחת בקשה לרופא',sending:'שולח…',retry:'ניסיון חוזר לאותה בקשה',error:'לא התקבל אישור שמירה. אפשר לנסות שוב כאן עם אותם פרטים כדי למנוע כפילות.',limited:'נשלחו כמה בקשות בזמן קצר. נסו שוב מאוחר יותר או צרו קשר עם המרפאה.',invalid:'בדקו שהפרטים מלאים, שתעודת הזהות כוללת 9 ספרות, שמספר הטלפון תקין ושסימנתם אישור ביקור ללא כרטיס.',closed:'הבקשה הקודמת נסגרה על ידי המרפאה. צרו קשר עם המרפאה לבירור.',success:'הבקשה נשמרה ביומן המרפאה. לא נקבע תור.',day:'תאריך הבקשה ביומן',reference:'אסמכתא'},
 ar:{badge:'خدمة جديدة',childId:'رقم هوية الطفل/ة — 9 أرقام بما فيها الأصفار في البداية',cardless:'تم تأكيد زيارة بدون بطاقة للطفل/ة',cardlessHelp:'يجب تأكيد زيارة بدون بطاقة، ثم وضع علامة بعد إتمام ذلك. العلامة هي إقرار من ولي الأمر وليست تحققًا من مكابي.',title:'طلب من الطبيب دون حجز موعد',note:'للطلبات غير العاجلة فقط. يظهر الطلب في تقويم العيادة بتاريخ إرساله، وتتم معالجته في أقرب يوم عمل. إرسال الطلب لا يحجز موعدًا ولا يضمن وقتًا محددًا للرد.',child:'اسم الطفل/ة',parent:'اسم ولي الأمر',phone:'رقم الهاتف للتواصل',message:'ما هو طلبكم من الطبيب؟',consent:'أوافق على إرسال التفاصيل والطلب إلى طاقم العيادة.',send:'إرسال الطلب للطبيب',sending:'جارٍ الإرسال…',retry:'إعادة محاولة إرسال نفس الطلب',error:'لم يصل تأكيد الحفظ. يمكن إعادة المحاولة هنا بنفس التفاصيل لتجنب التكرار.',limited:'تم إرسال عدة طلبات خلال فترة قصيرة. حاولوا لاحقًا أو اتصلوا بالعيادة.',invalid:'تأكدوا من تعبئة التفاصيل ورقم الهوية من 9 أرقام وصحة الهاتف ووضع علامة على تأكيد زيارة بدون بطاقة.',closed:'أغلقت العيادة الطلب السابق. يرجى التواصل معها للاستفسار.',success:'حُفظ الطلب في تقويم العيادة. لم يُحجز موعد.',day:'تاريخ الطلب في التقويم',reference:'رقم الطلب'},
 en:{badge:'New service',childId:'Child’s ID number — 9 digits including leading zeros',cardless:'Cardless visit authorization has been completed for this child',cardlessHelp:'Complete the cardless visit authorization, then check this box. This is a parent declaration, not verification with Maccabi.',title:'Request from the doctor without an appointment',note:'For non-urgent requests only. Your request appears in the clinic calendar on the date it was sent and is handled on the next working day. This does not book an appointment or guarantee a response time.',child:'Child’s name',parent:'Parent’s name',phone:'Contact phone',message:'What would you like to request?',consent:'I agree to share these details and this request with the clinic team.',send:'Send request to the doctor',sending:'Sending…',retry:'Retry this same request',error:'Saving has not been confirmed. Retry here with the same details to avoid duplicates.',limited:'Several requests were sent recently. Try later or contact the clinic.',invalid:'Check all details, the 9-digit ID and phone number, and confirm the cardless visit authorization.',closed:'The clinic closed the previous request. Contact the clinic for assistance.',success:'Your request was saved in the clinic calendar. No appointment was booked.',day:'Calendar date',reference:'Reference'},
};
type Payload={clinic?:'pediatrics'|'adhd';fund?:Fund;requestId:string;childName:string;parentName:string;phone:string;childId:string;cardlessVisitConfirmed:boolean;message:string;consent:boolean;website:string;language:BookingLanguage};
export default function DoctorRequest({language,clinic='pediatrics'}:{language:BookingLanguage;clinic?:'pediatrics'|'adhd'}) {
 const adhd=clinic==='adhd';
 const t=adhd?{...copy[language],note:adhdCopy[language].note,invalid:adhdCopy[language].invalid}:copy[language];
 const [fund,setFund]=useState<Fund|''>('');
 const needsCardless=!adhd||fund==='maccabi';
 const [pending,setPending]=useState(false);
 const [retry,setRetry]=useState<Payload|null>(null);
 const [error,setError]=useState('');
 const [receipt,setReceipt]=useState<{reference:string;calendarDay:string}|null>(null);
 const inFlight=useRef(false);
 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();if(inFlight.current)return;
  const form=new FormData(event.currentTarget);
  const body=retry??{...(adhd?{clinic:'adhd' as const,fund:(fund||undefined) as Fund|undefined}:{}),requestId:crypto.randomUUID(),childName:String(form.get('childName')??''),parentName:String(form.get('parentName')??''),phone:String(form.get('phone')??''),childId:String(form.get('childId')??''),cardlessVisitConfirmed:needsCardless&&form.get('cardlessVisitConfirmed')==='on',message:String(form.get('message')??''),consent:form.get('consent')==='on',website:String(form.get('website')??''),language};
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
 return <details className={styles.doctorRequest}><summary><span className={styles.newService}>{t.badge}</span> {t.title}</summary><p>{t.note}</p>
 {receipt?<div role="status" className={styles.receipt}><strong>{t.success}</strong><p>{t.day}: {new Date(receipt.calendarDay+'T12:00:00Z').toLocaleDateString(bookingLocale(language),{dateStyle:'full',timeZone:'Asia/Jerusalem'})}</p><small>{t.reference}</small><code dir="ltr">{receipt.reference}</code></div>:<form onSubmit={submit}>
 <fieldset className={styles.fields} disabled={pending||!!retry}>
 <label>{t.child}<input name="childName" required minLength={2} maxLength={100} autoComplete="off"/></label>
 <label>{t.childId}<input name="childId" type="text" inputMode="numeric" dir="ltr" required minLength={9} maxLength={9} pattern="[0-9]{9}" autoComplete="off"/></label>
 <label>{t.parent}<input name="parentName" required minLength={2} maxLength={100} autoComplete="name"/></label>
 <label>{t.phone}<input name="phone" type="tel" dir="ltr" required minLength={7} maxLength={25} autoComplete="tel"/></label>
 <label>{t.message}<textarea name="message" required minLength={5} maxLength={1000} rows={4}/></label>
 <label className={styles.honeypot} aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off"/></label>
 {adhd&&<label>{adhdCopy[language].fund}<select name="fund" required value={fund} onChange={e=>setFund(e.target.value as Fund)}><option value="" disabled>{adhdCopy[language].choose}</option>{FUNDS.map(f=><option key={f} value={f}>{paymentCopy[language].funds[f]}</option>)}</select></label>}
 {needsCardless&&<><p id={`cardless-help-${clinic}`} className={styles.muted}>{t.cardlessHelp}</p>
 <label className={styles.consent}><input name="cardlessVisitConfirmed" type="checkbox" required aria-describedby={`cardless-help-${clinic}`}/>{t.cardless}</label></>}
 <label className={styles.consent}><input name="consent" type="checkbox" required/>{t.consent}</label>
 </fieldset>
 {error&&<p role="alert" className={styles.error}>{t[error as 'error'|'limited'|'invalid'|'closed']}</p>}
 <button className={styles.primary} disabled={pending||error==='closed'}>{pending?t.sending:retry?t.retry:t.send}</button>
 </form>}</details>;
}
