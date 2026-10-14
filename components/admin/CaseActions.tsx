'use client';
import Link from 'next/link';
import {useState,useEffect} from 'react';
import {useRouter} from 'next/navigation';
export default function CaseActions({id,name,archived=false}:{id:string;name:string;archived?:boolean}){
 const [isArchived,setArchived]=useState(archived);useEffect(()=>setArchived(archived),[archived]);
 const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function act(){
  if(!window.confirm(isArchived?`להחזיר את התיק של ${name} לרשימת הדאשבורד?`:`להסיר את התיק של ${name} מהרשימה ולהעביר לארכיון? המידע והשאלונים יישמרו. תורים קיימים לא יבוטלו וימשיכו להופיע ביומן.`))return;
  setBusy(true);setError('');try{const r=await fetch('/api/admin/sessions/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:id,action:isArchived?'restore':'archive'})});const d=await r.json();if(!r.ok)throw Error(d.error);setArchived(!isArchived);router.refresh();}catch(e){setError(e instanceof Error?e.message:'הפעולה נכשלה');}finally{setBusy(false);}
 }
 return <div className="flex flex-wrap items-center gap-2"><Link href={`/admin/sessions/${id}/edit`} className="rounded-lg border border-teal-200 px-3 py-2 text-sm font-semibold text-teal-800" aria-label={`עריכת התיק של ${name}`}>עריכה</Link><button disabled={busy} onClick={act} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 disabled:opacity-50" aria-label={`${isArchived?'שחזור':'הסרה מהרשימה'}: ${name}`}>{busy?'שומר…':isArchived?'שחזור לרשימה':'הסרה מהרשימה'}</button>{error&&<p role="alert" className="w-full text-sm text-red-700">{error}</p>}</div>;
}
