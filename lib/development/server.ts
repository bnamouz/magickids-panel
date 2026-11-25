import { createHash, randomBytes } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getCurrentStaff, canEditReports } from '@/lib/admin/auth';
import { NextResponse } from 'next/server';
import { missingColumn, withoutFollowup } from '@/lib/development/followup';
export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export const token=()=>randomBytes(32).toString('hex');
export const privateHeaders={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
export const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
export async function staffGuard(req:Request,clinical=false) {
 const s=await getCurrentStaff(); if(!s || (clinical && !canEditReports(s))) throw new Error('UNAUTHORIZED');
 if(req.method!=='GET' && req.headers.get('origin')!==new URL(req.url).origin) throw new Error('ORIGIN');
 return s;
}
export async function access(req:Request) {
 const bearer=req.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 if(!/^[a-f0-9]{64}$/.test(bearer)) throw new Error('UNAUTHORIZED');
 const db=getSupabaseAdmin(), h=hash(bearer), now=new Date().toISOString();
 // A link is recognised by its hash or, since the follow-up change, by the stored link that staff can show and send again.
 let found=await db.from('development_referrals').select('*').or(`parent_hash.eq.${h},education_hash.eq.${h},parent_token.eq.${bearer},education_token.eq.${bearer}`).gt('expires_at',now).maybeSingle();
 if(found.error&&missingColumn(found.error)) found=await db.from('development_referrals').select('*').or(`parent_hash.eq.${h},education_hash.eq.${h}`).gt('expires_at',now).maybeSingle();
 const data=found.data;
 if(found.error||!data) throw new Error('UNAUTHORIZED');
 return {db,row:data,role:data.parent_hash===h||data.parent_token===bearer?'parent' as const:data.education_role as 'teacher'|'kindergarten'};
}
/** Update that still succeeds while the follow-up columns are missing: it is retried once without them. */
export async function updateCase(db:ReturnType<typeof getSupabaseAdmin>,update:Record<string,unknown>,where:(q:any)=>any) {
 let r=await where(db.from('development_referrals').update(update)).select('id').maybeSingle();
 if(r.error&&missingColumn(r.error)){const rest=withoutFollowup(update);if(!Object.keys(rest).length)return {data:null,error:r.error,degraded:true};r=await where(db.from('development_referrals').update(rest)).select('id').maybeSingle();return {...r,degraded:true};}
 return {...r,degraded:false};
}
export function failure(e:unknown) { const m=e instanceof Error?e.message:'';return json({error:m==='UNAUTHORIZED'?'נדרשת הזדהות או שהקישור פג תוקף':m==='ORIGIN'?'הבקשה נדחתה':'הפעולה לא הושלמה. נסו שוב או פנו למכון.'},m==='UNAUTHORIZED'?401:m==='ORIGIN'?403:500); }
