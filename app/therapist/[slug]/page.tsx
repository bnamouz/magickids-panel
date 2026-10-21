import { notFound } from 'next/navigation';
import BookingManager from '@/components/therapists/RanaBookingManager';
import { bookingProfile } from '@/lib/therapists/parent-booking';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:{slug:string}}){
 const p=await bookingProfile(params.slug).catch(()=>null);
 return {title:p?`היומן של ${p.therapist.name} · ילדי הקסם`:'ילדי הקסם',robots:{index:false,follow:false},referrer:'no-referrer' as const};
}
export default async function Page({params}:{params:{slug:string}}){
 const p=await bookingProfile(params.slug).catch(e=>e?.status===404?null:undefined);
 if(p===null)notFound();
 return <BookingManager slug={params.slug}/>;
}
