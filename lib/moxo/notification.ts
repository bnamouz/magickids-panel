import { getSupabaseAdmin } from '@/lib/supabase';
import { sendWhatsAppText, sendInstituteWhatsAppText } from '@/lib/whatsapp-ultramsg';
// Claim once before contacting the provider. Uncertain sends require staff review,
// never an automatic retry that could send duplicate confirmations.
// sender 'institute' = verified Magic Kids WhatsApp (0544020043), no fallback to the shared instance.
export async function notifyOnce(id:string,phone:string,message:string,opts:{sender?:'shared'|'institute'}={}){
 const db=getSupabaseAdmin();
 const institute=opts.sender==='institute';
 if(institute?(!process.env.MAGIC_KIDS_ULTRAMSG_INSTANCE_ID||!process.env.MAGIC_KIDS_ULTRAMSG_TOKEN):(!process.env.ULTRAMSG_INSTANCE_ID||!process.env.ULTRAMSG_TOKEN))return 'not_configured';
 const inserted=await db.from('clinic_notifications').upsert({id},{onConflict:'id',ignoreDuplicates:true});
 if(inserted.error)return 'unavailable';
 const claim=await db.from('clinic_notifications').update({state:'sending',updated_at:new Date().toISOString()}).eq('id',id).in('state',['pending','failed']).select('id').maybeSingle();
 if(claim.error)return 'unavailable';
 if(!claim.data){const prior=await db.from('clinic_notifications').select('state').eq('id',id).maybeSingle();return prior.data?.state??'unknown';}
 const result=institute?await sendInstituteWhatsAppText({toPhone:phone,body:message}):await sendWhatsAppText({toPhone:phone,body:message});
 // A definite rejection is 'failed' (safe to retry); only an uncertain timeout stays 'unknown'.
 const state=result.ok?'accepted':result.error==='send_uncertain'?'unknown':'failed';
 const saved=await db.from('clinic_notifications').update({state,provider_id:result.ok?(result.id??null):`error:${String(result.error??'unknown').slice(0,60)}`,updated_at:new Date().toISOString()}).eq('id',id).eq('state','sending');
 return saved.error?'unknown':state;
}
