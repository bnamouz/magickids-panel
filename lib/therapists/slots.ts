import { localParts, localToUTC, overlaps } from '@/lib/booking/schedule';
import type { Therapist } from './schema';
export function therapistSlots(t:Therapist, bookings:{id:string;scheduled_at:string;duration_minutes:number}[], now=new Date(), exclude?:string) {
 if(!t.active)return [];
 const first=Date.parse(localParts(now).date+'T00:00:00Z'), slots:string[]=[];
 for(let d=0;d<28;d++){
  const day=new Date(first+d*86400000),date=day.toISOString().slice(0,10);
  if(t.leave_dates.some(l=>l.start<=date&&l.end>=date))continue;
  for(const h of t.hours.filter(h=>h.day===day.getUTCDay()))for(let m=Math.ceil(h.start/15)*15;m+t.duration<=h.end;m+=15){
   const start=localToUTC(date,m).toISOString(),end=new Date(Date.parse(start)+t.duration*60000).toISOString();
   if(Date.parse(start)<=now.getTime()+60*60000)continue;
   if(!bookings.some(b=>b.id!==exclude&&overlaps(start,end,{start:b.scheduled_at,end:new Date(Date.parse(b.scheduled_at)+b.duration_minutes*60000).toISOString()})))slots.push(start);
  }
 }
 return [...new Set(slots)].sort();
}
