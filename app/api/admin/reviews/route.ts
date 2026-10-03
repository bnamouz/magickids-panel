import {NextRequest,NextResponse} from 'next/server';
import {getCurrentStaff} from '@/lib/admin/auth';
import {getSupabaseAdmin} from '@/lib/supabase';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(b:unknown,s=200)=>NextResponse.json(b,{status:s,headers:{'Cache-Control':'private, no-store'}});
export async function GET(){const staff=await getCurrentStaff();if(staff?.role!=='admin')return reply({error:'forbidden'},403);const r=await getSupabaseAdmin().from('clinic_reviews').select('id,display_name,service,rating,body,status,created_at').order('created_at',{ascending:false}).limit(200);return r.error?reply({error:'unavailable'},503):reply({reviews:r.data});}
export async function POST(req:NextRequest){const staff=await getCurrentStaff();if(staff?.role!=='admin'||req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'forbidden'},403);try{const b=z.object({id:z.string().uuid(),status:z.enum(['approved','hidden'])}).strict().parse(await req.json());const r=await getSupabaseAdmin().from('clinic_reviews').update({status:b.status,moderated_at:new Date().toISOString(),moderated_by:staff.id}).eq('id',b.id).select('id').single();return r.error?reply({error:'save_failed'},409):reply({saved:true});}catch{return reply({error:'invalid'},400);}}
