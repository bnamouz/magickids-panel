import { notFound } from 'next/navigation';
import ParentBooking from '@/components/therapists/ParentBooking';
import { bookingProfile, treatmentLabels } from '@/lib/therapists/parent-booking';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:{slug:string}}){
 const p=await bookingProfile(params.slug).catch(()=>null);
 const title=p?`בקשת תור ל${p.therapist.name} · ${treatmentLabels(p.therapist.treatments).he} | ילדי הקסם`:'ילדי הקסם';
 return {title,robots:{index:false,follow:false},referrer:'no-referrer' as const};
}
export default async function Page({params}:{params:{slug:string}}){
 const p=await bookingProfile(params.slug).catch(e=>e?.status===404?null:undefined);
 if(p===null)notFound();
 return <ParentBooking slug={params.slug}/>;
}
