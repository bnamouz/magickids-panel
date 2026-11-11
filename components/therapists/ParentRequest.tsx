'use client';
import {useEffect,useRef,useState} from 'react';
import {requestBookingId,requestBookingToken,bookingDate,bookingTime,bookingMessages} from './booking-ui';
import './booking.css';
import NationalIdField from '@/components/NationalIdField';
import {nationalIdSchema} from '@/lib/shared/national-id';
type Price={key:string;label:string;price:number|null;duration:number|null;note?:string};
type Props={slug:string;name:string;treatment:string;pricing:Price[];duration:number|null;contactPhone?:string|null};
const fmtPhone=(p:string)=>p.replace(/^\+972(\d{2})(\d{3})(\d{4})$/,'0$1-$2-$3');
const statusText:Record<string,string>={awaiting_time:'הבקשה התקבלה · ממתינה לקביעת מועד',syncing:'המועד נקבע · הרישום ביומן מושלם',confirmed:'המועד נקבע ונרשם ביומן',closed:'הבקשה נסגרה'};
/** Parent page for therapists who set the appointment time themselves.
 *  No slot picker: the parent leaves details and preferences, the therapist
 *  chooses the time in her portal, and the parent is notified by WhatsApp. */
export default function ParentRequest({slug,name,treatment,pricing,duration,contactPhone}:Props){
 const priced=pricing.some(p=>p.price!==null);
 const api=`/api/therapy/${encodeURIComponent(slug)}`;
 const first=name.split(' ')[0];
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[result,setResult]=useState<any>(null),[loading,setLoading]=useState(true),[tracking,setTracking]=useState('');
 const [patient,setPatient]=useState(''),[contact,setContact]=useState(''),[phone,setPhone]=useState(''),[note,setNote]=useState(''),[consent,setConsent]=useState(false),[service,setService]=useState(pricing.length===1?pricing[0].key:'');
 const chosen=pricing.find(p=>p.key===service);
 const contactNumber=result?.contact_phone??contactPhone??null;
 const proof=useRef({id:'',token:''}),lock=useRef(false);
 async function call(body:unknown){const r=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(bookingMessages[d.error]||'לא ניתן להשלים כרגע. נסו שוב או פנו למכון.');return d;}
 async function loadStatus(){const d=await call({action:'status',...proof.current});setResult(d);}
 useEffect(()=>{
  const hash=new URLSearchParams(location.hash.slice(1)),id=hash.get('id')||'',token=hash.get('token')||'';
  if(id&&token){proof.current={id,token};setTracking(location.href);void loadStatus().catch(e=>setMessage(e.message)).finally(()=>setLoading(false));}
  else{proof.current={id:requestBookingId(),token:requestBookingToken()};setLoading(false);}
 },[]);
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setMessage('');try{await fn();}catch(e){setMessage(e instanceof Error?e.message:'לא ניתן להשלים כרגע');}finally{setBusy(false);lock.current=false;}}
 async function submit(nationalId:string){
  if(!consent||!patient.trim()||!contact.trim()||!phone.trim()||(pricing.length>1&&!chosen))return;
  const checked=nationalIdSchema.safeParse(nationalId);
  if(!checked.success)throw new Error('יש להזין תעודת זהות תקינה של הילד/ה בת 9 ספרות.');
  await call({action:'request',...proof.current,patient,contact,phone,national_id:checked.data,note,consent,website:'',service:chosen?.key});
  history.replaceState(null,'','#'+new URLSearchParams(proof.current).toString());
  setTracking(location.href);await loadStatus();
 }
 const priceBox=<div className="rb-selection rb-price"><p className="rb-eyebrow">{pricing.length>1?(priced?'סוגי הטיפול והמחירים':'סוגי הטיפול והשירותים'):'מחיר המפגש'}</p>{pricing.length?pricing.map(p=><div key={p.key}><strong>{p.label}</strong>{p.price!==null?<bdi>{p.price} ₪</bdi>:<em>המחיר יימסר על ידי הצוות</em>}{p.note&&<span>{p.note}</span>}</div>):<p>המחיר נמסר בעת קביעת המועד.</p>}<span>{priced?'התשלום מתבצע במכון.':'המחירים נקבעים על ידי הצוות ויימסרו לכם בשיחה עם '+first+'.'}{pricing.length===1&&priced&&` ${first} מבצעת טיפולי ${treatment} רגילים בלבד.`}</span></div>;
 return <main className="rana-booking" dir="rtl"><header className="rb-brand"><svg aria-label="ילדי הקסם" viewBox="0 0 40 40" width="36" height="36" fill="none"><path d="M6 31V12l14 9 14-9v19M6 7l14 9L34 7" stroke="currentColor" strokeWidth="3.5"/><circle cx="20" cy="6" r="3" fill="currentColor"/></svg><div><strong>ילדי הקסם</strong><span>תיאום {treatment}</span></div><a href="/">לאתר המכון</a></header>
  <section className="rb-intro"><p className="rb-eyebrow">{name} · {treatment}</p><h1>{result?'הבקשה שלכם לטיפול':`בקשת טיפול אצל ${first}`}</h1><p>משאירים פרטים והעדפות, ו{first} קובעת את מועד המפגש בעצמה. לאחר קביעת המועד תקבלו הודעת WhatsApp עם התאריך, השעה והכתובת.</p></section>
  {message&&<p role="alert" className="rb-notice">{message}</p>}
  {loading?<div className="rb-card" role="status">טוען…</div>:result?<section className="rb-card rb-receipt">
   <span className={'rb-badge '+(result.status==='awaiting_time'?'pending':result.status)}>{statusText[result.status]||result.status}</span>
   {result.service&&<p className="rb-service">{result.service}</p>}
   {result.starts_at?<><h2>{bookingDate(result.starts_at)} · <bdi>{bookingTime(result.starts_at)}–{bookingTime(result.ends_at)}</bdi></h2><p>משך המפגש: {result.duration} דקות · לפי שעון ישראל</p></>:<h2>המועד טרם נקבע</h2>}
   {priceBox}
   {contactNumber&&<div className="rb-selection rb-contact"><p className="rb-eyebrow">יצירת קשר ישירה עם {first}</p><bdi className="rb-contact-number">{fmtPhone(contactNumber)}</bdi><div className="rb-actions"><a className="rb-button" href={`tel:${contactNumber}`}>חיוג</a><a className="rb-button" href={`https://wa.me/${contactNumber.replace('+','')}?text=${encodeURIComponent(`שלום ${first}, פתחתי בקשה דרך אתר ילדי הקסם ואשמח לתאם.`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></div><span>אפשר לפנות אליה ישירות לתיאום; הבקשה כבר נמצאת אצלה.</span></div>}
   {result.status==='awaiting_time'&&<p>הבקשה הועברה ל{first}. היא תקבע את התאריך והשעה ביומן{contactNumber?' (אפשר גם לתאם איתה ישירות בטלפון)':' לפי ההעדפות שציינתם'}, ותקבלו הודעת WhatsApp למספר שמסרתם. אין להגיע לפני שנמסר לכם מועד.</p>}
   {result.status==='syncing'&&<p>{first} קבעה מועד; רישום האירוע ביומן מושלם כעת.</p>}
   {result.status==='confirmed'&&<p>המועד נקבע ונרשם ביומן של {first}. לשינוי או לביטול פנו למכון בטלפון 054-402-0043.</p>}
   {result.status==='closed'&&<p>הבקשה נסגרה ואין מועד פעיל. אפשר לשלוח בקשה חדשה או לפנות למכון.</p>}
   <div className="rb-actions"><button disabled={busy} onClick={()=>void run(loadStatus)}>רענון מצב הבקשה</button>{result.status==='closed'&&<a className="rb-button" href={`/therapy/${slug}`}>בקשה חדשה</a>}</div>
   <label>הקישור האישי למעקב<input dir="ltr" readOnly value={tracking} onFocus={e=>e.currentTarget.select()}/></label><p className="rb-small">שמרו את הקישור במועדפים. הוא אישי; אין להעביר אותו לאחרים.</p>
  </section>:<div className="rb-columns"><section className="rb-card"><h2>איך זה עובד</h2>
   {priceBox}
   <ol className="rb-steps"><li>ממלאים את פרטי הילד/ה וההורה ומציינים ימים ושעות שנוחים לכם.</li><li>{first} בוחרת מועד למפגש{pricing.length>1?' לפי סוג הטיפול שבחרתם':duration?` (${duration} דקות)`:''} ורושמת אותו ביומן.</li><li>{contactPhone?`מיד אחרי השליחה מקבלים את מספר הטלפון של ${first} ליצירת קשר ישיר, ו`:''}מקבלים הודעת WhatsApp עם המועד והכתובת: דאהר עומר אלזידאני 9, שפרעם.</li></ol>
   <p className="rb-small">הבקשה אינה קביעת תור. אין להזין מידע רפואי בטופס.</p>
  </section><section className="rb-card"><p className="rb-eyebrow">הבקשה שלכם</p><h2>פרטי ההורה והילד</h2>
   <form onSubmit={e=>{e.preventDefault();const id=String(new FormData(e.currentTarget).get("national_id")??"");void run(()=>submit(id));}}>{pricing.length>1&&<fieldset className="rb-services"><legend>סוג הטיפול המבוקש</legend>{pricing.map(p=><label key={p.key} className={'rb-service-option'+(service===p.key?' selected':'')}><input type="radio" name="service" required value={p.key} checked={service===p.key} onChange={()=>setService(p.key)} disabled={busy}/><span><strong>{p.label}</strong><small>{p.price!==null?`${p.price} ₪ ${p.note??''}`:'המחיר יימסר על ידי הצוות'}{p.duration?` · ${p.duration} דקות`:''}</small></span></label>)}</fieldset>}<label>שם הילד/ה<input required minLength={2} maxLength={100} value={patient} onChange={e=>setPatient(e.target.value)} autoComplete="off" disabled={busy}/></label><label>שם ההורה / איש הקשר<input required minLength={2} maxLength={100} value={contact} onChange={e=>setContact(e.target.value)} autoComplete="name" disabled={busy}/></label><label>טלפון נייד (אליו תישלח הודעת המועד)<input required type="tel" dir="ltr" inputMode="tel" placeholder="0501234567" value={phone} maxLength={24} onChange={e=>setPhone(e.target.value)} autoComplete="tel" disabled={busy}/></label>
    <NationalIdField disabled={busy}/>
    <label>ימים ושעות שנוחים לכם (לא חובה)<textarea className="rb-textarea" maxLength={160} rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="לדוגמה: ימי שני או רביעי אחר הצהריים" disabled={busy}/></label>
    <label className="rb-check"><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={busy}/>אני מסכים/ה להעברת הפרטים למכון ול{first} לצורך תיאום הטיפול, ולקבלת הודעת WhatsApp עם המועד ותזכורת לפני המפגש. {priced?<>ידוע לי שהמחיר הוא {chosen&&chosen.price!==null?`${chosen.price} ₪ ${chosen.note??''}`.trim():'כמפורט בעמוד לפי סוג הטיפול שאבחר'}.</>:<>ידוע לי שעלות השירות תימסר לי על ידי הצוות.</>}</label>
    <button className="rb-primary rb-full" disabled={busy||!consent||(pricing.length>1&&!chosen)}>{busy?'שולח את הבקשה…':`שליחת בקשה ל${first}`}</button>
   </form><p className="rb-small">לאחר השליחה יופיע קישור אישי למעקב. המועד נקבע על ידי {first} בלבד.</p></section></div>}
  <footer className="rb-footer">ילדי הקסם · מרחב תיאום טיפולים · המחירים כוללים מע״מ</footer>
 </main>;
}
