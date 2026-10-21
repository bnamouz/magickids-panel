import {requireStaff} from '@/lib/admin/auth';
import {getSupabaseAdmin} from '@/lib/supabase';
import {BASE,portalToken} from '@/lib/therapists/server';
import BookingManager from '@/components/therapists/RanaBookingManager';
export const dynamic='force-dynamic';
export const metadata={referrer:'no-referrer' as const};
export default async function Page({params}:{params:{slug:string}}){
 await requireStaff();const db=getSupabaseAdmin();
 const slug=params.slug.toLowerCase();
 const p=await db.from('therapist_booking_profiles').select('therapist_id,enabled').eq('slug',slug).maybeSingle();
 if(p.error||!p.data)return <p className="card">היומן טרם הוגדר למטפל/ת זו. יש ליצור פרופיל הזמנות לפני הפעלת העמוד.</p>;
 const t=await db.from('therapists').select('*').eq('id',p.data.therapist_id).eq('active',true).maybeSingle();
 const link=t.data&&Date.parse(t.data.token_expires_at)>Date.now()?`${BASE}/therapist/${slug}#id=${t.data.id}&token=${portalToken(t.data)}`:'';
 return <BookingManager admin slug={slug} therapistLink={link}/>;
}
