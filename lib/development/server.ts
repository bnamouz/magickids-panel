import { createHash, randomBytes } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getCurrentStaff, canEditReports } from '@/lib/admin/auth';
import { NextResponse } from 'next/server';
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
 const db=getSupabaseAdmin(), h=hash(bearer);
 const {data,error}=await db.from('development_referrals').select('*').or(`parent_hash.eq.${h},education_hash.eq.${h}`).gt('expires_at',new Date().toISOString()).maybeSingle();
 if(error||!data) throw new Error('UNAUTHORIZED');
 return {db,row:data,role:data.parent_hash===h?'parent' as const:data.education_role as 'teacher'|'kindergarten'};
}
export function failure(e:unknown) { const m=e instanceof Error?e.message:'';return json({error:m==='UNAUTHORIZED'?'נדרשת הזדהות או שהקישור פג תוקף':m==='ORIGIN'?'הבקשה נדחתה':'הפעולה לא הושלמה. נסו שוב או פנו למכון.'},m==='UNAUTHORIZED'?401:m==='ORIGIN'?403:500); }
