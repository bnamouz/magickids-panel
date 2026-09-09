import { getSupabaseAdmin } from '@/lib/supabase';
import { sendWhatsAppText } from '@/lib/whatsapp-ultramsg';
// Claim once before contacting the provider. Uncertain sends require staff review,
// never an automatic retry that could send duplicate confirmations.
export async function notifyOnce(id:string,phone:string,message:string){
 const db=getSupabaseAdmin();
 if(!process.env.ULTRAMSG_INSTANCE_ID||!process.env.ULTRAMSG_TOKEN)return 'not_configured';
 const inserted=await db.from('clinic_notifications').upsert({id},{onConflict:'id',ignoreDuplicates:true});
 if(inserted.error)return 'unavailable';
 const claim=await db.from('clinic_notifications').update({state:'sending',updated_at:new Date().toISOString()}).eq('id',id).eq('state','pending').select('id').maybeSingle();
 if(claim.error)return 'unavailable';
 if(!claim.data){const prior=await db.from('clinic_notifications').select('state').eq('id',id).maybeSingle();return prior.data?.state??'unknown';}
 const result=await sendWhatsAppText({toPhone:phone,body:message});
 const state=result.ok?'accepted':'unknown';
 const saved=await db.from('clinic_notifications').update({state,provider_id:result.id??null,updated_at:new Date().toISOString()}).eq('id',id).eq('state','sending');
 return saved.error?'unknown':state;
}
