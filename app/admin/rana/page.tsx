import {requireStaff} from '@/lib/admin/auth';
import {getSupabaseAdmin} from '@/lib/supabase';
import {BASE,portalToken} from '@/lib/therapists/server';
import RanaBookingManager from '@/components/therapists/RanaBookingManager';
export const dynamic='force-dynamic';
export const metadata={referrer:'no-referrer' as const};
export default async function Page(){
 await requireStaff();const db=getSupabaseAdmin();
 const p=await db.from('therapist_booking_profiles').select('therapist_id').eq('slug','rana').maybeSingle();
 if(p.error||!p.data)return <p>היומן טרם הוגדר. יש להשלים את הגדרת רנא לפני הפעלת העמוד.</p>;
 const t=await db.from('therapists').select('*').eq('id',p.data.therapist_id).eq('active',true).maybeSingle();
 const link=t.data&&Date.parse(t.data.token_expires_at)>Date.now()?`${BASE}/therapist/rana#id=${t.data.id}&token=${portalToken(t.data)}`:'';
 return <RanaBookingManager admin therapistLink={link}/>;
}
