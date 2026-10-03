import {NextRequest,NextResponse} from 'next/server';
import {getCurrentStaff} from '@/lib/admin/auth';
import {getSupabaseAdmin} from '@/lib/supabase';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(b:unknown,s=200)=>NextResponse.json(b,{status:s,headers:{'Cache-Control':'private, no-store'}});
export async function GET(){const staff=await getCurrentStaff();if(staff?.role!=='admin')return reply({error:'forbidden'},403);const db=getSupabaseAdmin(),r=await db.from('clinic_gallery').select('id,email,storage_path,status,consent_at,created_at').neq('status','uploading').order('created_at',{ascending:false}).limit(100);if(r.error)return reply({error:'unavailable'},503);const photos=await Promise.all((r.data||[]).map(async p=>({...p,url:(await db.storage.from('clinic-gallery').createSignedUrl(p.storage_path,300)).data?.signedUrl})));return reply({photos});}
export async function POST(req:NextRequest){const staff=await getCurrentStaff();if(staff?.role!=='admin'||req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'forbidden'},403);try{const b=z.object({id:z.string().uuid(),status:z.enum(['approved','hidden'])}).strict().parse(await req.json());const r=await getSupabaseAdmin().from('clinic_gallery').update({status:b.status,moderated_by:staff.id,moderated_at:new Date().toISOString()}).eq('id',b.id).neq('status','uploading').select('id').single();return r.error?reply({error:'save_failed'},409):reply({saved:true});}catch{return reply({error:'invalid'},400);}}
