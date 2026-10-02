import {localParts,localToUTC} from '@/lib/booking/schedule';
export const MOXO_HOURS=['09:00','10:00','11:00','12:00'];
export function moxoDates(now=new Date()){
 const first=Date.parse(localParts(now).date+'T00:00:00Z');const result:string[]=[];
 for(let i=0;i<90;i++){const d=new Date(first+i*86400000),date=d.toISOString().slice(0,10);if([2,4].includes(d.getUTCDay())&&localToUTC(date,720)>now)result.push(date);}
 return result;
}
export function moxoHours(date:string,now=new Date()){return MOXO_HOURS.filter(time=>localToUTC(date,Number(time.slice(0,2))*60)>now);}
