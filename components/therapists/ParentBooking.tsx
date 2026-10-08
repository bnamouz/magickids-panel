'use client';
import {useEffect,useRef,useState} from 'react';
import {requestBookingId,requestBookingToken,bookingDate,bookingTime,bookingMessages,statusLabel} from './booking-ui';
import './booking.css';
type Slot={start:string;end:string;duration:number;day:string};
export default function ParentBooking(){
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[slots,setSlots]=useState<Slot[]>([]),[day,setDay]=useState(''),[selected,setSelected]=useState<Slot|null>(null),[result,setResult]=useState<any>(null),[tracking,setTracking]=useState(''),[patient,setPatient]=useState(''),[contact,setContact]=useState(''),[phone,setPhone]=useState(''),[consent,setConsent]=useState(false),[online,setOnline]=useState(false);
 const proof=useRef({id:'',token:''});
 const controller=useRef(false);
 async function call(body:unknown){const r=await fetch('/api/therapy/rana',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(bookingMessages[d.error]||'לא ניתן להשלים כרגע. נסו שוב או פנו למכון.');return d;}
 async function loadSlots(){
  setLoading(true);setOnline(false);
  try{const r=await fetch('/api/therapy/rana',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(bookingMessages[d.error]||'לא ניתן לטעון שעות פנויות כרגע.');
   setSlots(d.slots);setDay(old=>d.slots.some((s:Slot)=>s.day===old)?old:d.slots[0]?.day||'');setOnline(true);
  }finally{setLoading(false);}
 }
 async function loadStatus(){const d=await call({action:'status',...proof.current});setResult(d);}
 useEffect(()=>{
  const hash=new URLSearchParams(location.hash.slice(1)),id=hash.get('id')||'',token=hash.get('token')||'';
  if(id&&token){proof.current={id,token};setTracking(location.href);void loadStatus().catch(e=>setMessage(e.message)).finally(()=>setLoading(false));}
  else{proof.current={id:requestBookingId(),token:requestBookingToken()};void loadSlots().catch(e=>setMessage(e.message));}
 },[]);
 async function run(fn:()=>Promise<void>){if(controller.current)return;controller.current=true;setBusy(true);setMessage('');try{await fn();}catch(e){setMessage(e instanceof Error?e.message:'לא ניתן להשלים כרגע');}finally{setBusy(false);controller.current=false;}}
 async function submit(){
  if(!selected||!consent||!patient.trim()||!contact.trim())return;
  await call({action:'request',...proof.current,patient,contact,phone,start:selected.start,consent,website:''});
  const hash=new URLSearchParams(proof.current).toString();history.replaceState(null,'','#'+hash);
  setTracking(location.href);await loadStatus();setSelected(null);
 }
 const days=[...new Set(slots.map(s=>s.day))];
 return <main className="rana-booking" dir="rtl"><header className="rb-brand"><svg aria-label="ילדי הקסם" viewBox="0 0 40 40" width="36" height="36" fill="none"><path d="M6 31V12l14 9 14-9v19M6 7l14 9L34 7" stroke="currentColor" strokeWidth="3.5"/><circle cx="20" cy="6" r="3" fill="currentColor"/></svg><div><strong>ילדי הקסם</strong><span>תיאום טיפול רגשי</span></div><a href="/">לאתר המכון</a></header>
  <section className="rb-intro"><p className="rb-eyebrow">רנא שלח דור · טיפול רגשי</p><h1>{result?'הבקשה שלכם לתור':'נמצא זמן שמתאים לכם'}</h1><p>בוחרים שעה פנויה ושולחים בקשה. התור נקבע רק לאחר אישור של רנא ורישום ביומן.</p></section>
  {message&&<p role="alert" className="rb-notice">{message}</p>}
  {loading&&!result?<div className="rb-card" role="status">טוען את היומן…</div>:result?<section className="rb-card rb-receipt">
   <span className={'rb-badge '+result.status}>{statusLabel[result.status]||result.status}</span>
   <h2>{bookingDate(result.starts_at)} · <bdi>{bookingTime(result.starts_at)}–{bookingTime(result.ends_at)}</bdi></h2>
   <p>משך המפגש: {result.duration} דקות · לפי שעון ישראל</p>
   {result.status==='pending'&&<p>הבקשה הועברה לרנא. אין להגיע לפני שמופיע כאן אישור סופי. הבקשה תפקע אם לא תטופל עד {bookingDate(result.expires_at)}, {bookingTime(result.expires_at)}.</p>}
   {result.status==='syncing'&&<p>רנא מטפלת בבקשה, אך הרישום ביומן טרם הושלם. עדיין אין אישור סופי לתור.</p>}
   {result.status==='confirmed'&&<p>התור אושר ונרשם ביומן רנא. לשינוי או לביטול יש לפנות למכון.</p>}
   {['rejected','expired','cancelled'].includes(result.status)&&<p>אין תור פעיל לבקשה זו. אפשר לבחור מועד אחר ולשלוח בקשה חדשה.</p>}
   <div className="rb-actions"><button disabled={busy} onClick={()=>void run(loadStatus)}>רענון מצב הבקשה</button>{['rejected','expired','cancelled'].includes(result.status)&&<a className="rb-button" href="/therapy/rana">בקשה חדשה</a>}</div>
   <label>הקישור האישי למעקב<input dir="ltr" readOnly value={tracking} onFocus={e=>e.currentTarget.select()}/></label><p className="rb-small">שמרו את הקישור במועדפים. הוא אישי; אין להעביר אותו לאחרים. בשלב זה אין הודעות אישור אוטומטיות בדוא״ל או ב־WhatsApp.</p>
  </section>:<div className="rb-columns"><section className="rb-card"><div className="rb-section-head"><h2>בחירת יום ושעה</h2><button disabled={busy} onClick={()=>void run(async()=>{setSelected(null);await loadSlots();})}>רענון</button></div><p className="rb-small">כל השעות לפי שעון ישראל. מוצגים מועדים פנויים בלבד, ללא פרטי מטופלים אחרים.</p>
   {!online?<div className="rb-empty">אין כרגע אישור שהיומן זמין. נסו לרענן בהמשך; לא ניתן לשלוח בקשות כשהחיבור אינו זמין.</div>:!slots.length?<div className="rb-empty">אין כרגע שעות פנויות ב־28 הימים הקרובים. אפשר לבדוק שוב בהמשך.</div>:<><div className="rb-days">{days.map(d=><button key={d} aria-pressed={day===d} className={day===d?'selected':''} disabled={busy} onClick={()=>{setDay(d);setSelected(null);}}>{bookingDate(d+'T12:00:00Z')}</button>)}</div><div className="rb-slots">{slots.filter(s=>s.day===day).map(s=><button key={s.start} aria-pressed={selected?.start===s.start} disabled={busy} className={selected?.start===s.start?'selected':''} onClick={()=>setSelected(s)}><bdi>{bookingTime(s.start)}–{bookingTime(s.end)}</bdi><span>{s.duration} דקות</span></button>)}</div></>}
  </section><section className="rb-card"><p className="rb-eyebrow">הבקשה שלכם</p><h2>פרטי ההורה והילד</h2><div className="rb-selection">{selected?<><strong>{bookingDate(selected.start)}</strong><bdi>{bookingTime(selected.start)}–{bookingTime(selected.end)}</bdi><span>{selected.duration} דקות</span></>:<p>בחרו שעה פנויה ביומן כדי להמשיך.</p>}</div>
   <form onSubmit={e=>{e.preventDefault();void run(submit);}}><label>שם הילד/ה<input required minLength={2} maxLength={100} value={patient} onChange={e=>setPatient(e.target.value)} autoComplete="off" disabled={busy}/></label><label>שם ההורה / איש הקשר<input required minLength={2} maxLength={100} value={contact} onChange={e=>setContact(e.target.value)} autoComplete="name" disabled={busy}/></label><label>טלפון נייד<input required type="tel" dir="ltr" inputMode="tel" placeholder="0501234567" value={phone} maxLength={24} onChange={e=>setPhone(e.target.value)} autoComplete="tel" disabled={busy}/></label>
    <label className="rb-check"><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={busy}/>אני מסכים/ה להעברת הפרטים למכון ולרנא לצורך תיאום הטיפול, ומבין/ה שהבקשה אינה אישור לתור.</label>
    <button className="rb-primary rb-full" disabled={busy||!selected||!online||!consent}>{busy?'שומר את הבקשה…':'שליחת בקשה לרנא'}</button>
   </form><p className="rb-small">יש להזין פרטי קשר בלבד, ללא מידע רפואי. לאחר השליחה יופיע קישור אישי למעקב אחר החלטת רנא.</p></section></div>}
  <footer className="rb-footer">ילדי הקסם · מרחב תיאום טיפולים · כל השעות בספרות 0–9</footer>
 </main>;
}
