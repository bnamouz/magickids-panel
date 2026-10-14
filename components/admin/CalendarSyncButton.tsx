'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
export default function CalendarSyncButton(){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');const router=useRouter();
 async function sync(){setBusy(true);setMessage('');try{
  const res=await fetch('/api/admin/calendar/reconcile',{method:'POST'});const result=await res.json();
  if(!res.ok)throw new Error();
  setMessage(result.busy?'בדיקת סנכרון כבר מתבצעת. יש לרענן בעוד רגע.':result.failed||result.mismatches?'הבדיקה הסתיימה ויש פערים שדורשים בדיקה.':'הסנכרון והבדיקה הסתיימו.');router.refresh();
 }catch{setMessage('הסנכרון לא הושלם. יש לנסות שוב.');}finally{setBusy(false);}}
 return <div><button type="button" onClick={sync} disabled={busy} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy?'בודק ומסנכרן…':'סנכרון ובדיקת היומנים'}</button><p role="status" className="mt-2 text-sm">{message}</p></div>;
}
