'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
const labels:Record<string,string>={synced:'מסונכרן ליומן Google של המכון',pending:'טרם סונכרן ליומן Google',failed:'הסנכרון נכשל — יש לנסות שוב',not_configured:'חיבור יומן Google אינו מוגדר',unavailable:'לא ניתן לאמת את הסנכרון כרגע',not_approved:'ניתן לסנכרן רק מבדק מאושר'};
export default function CalendarSync({id,status}:{id:string;status:string}){
 const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function sync(){setBusy(true);try{const res=await fetch('/api/admin/moxo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action:'sync_calendar'})});const data=await res.json();setMessage(res.ok?(labels[data.calendar]??labels.unavailable):labels.unavailable);router.refresh();}catch{setMessage(labels.unavailable);}finally{setBusy(false);}}
 return <div className="space-y-2"><p>{labels[status]??labels.pending}</p>{status!=='synced'&&<button type="button" disabled={busy} onClick={sync} className="btn-primary">{busy?'מסנכרן…':'סנכרון ליומן Google'}</button>}{message&&<p role="status">{message}</p>}</div>;
}
