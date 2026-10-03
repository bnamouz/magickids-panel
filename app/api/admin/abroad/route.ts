import {NextRequest,NextResponse} from 'next/server';
import {getCurrentStaff} from '@/lib/admin/auth';
import {getSupabaseAdmin} from '@/lib/supabase';
import {pricingSchema} from '@/lib/abroad/quote';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(b:unknown,s=200)=>NextResponse.json(b,{status:s,headers:{'Cache-Control':'private, no-store'}});
export async function GET(){if((await getCurrentStaff())?.role!=='admin')return reply({error:'forbidden'},403);const db=getSupabaseAdmin();const [p,r]=await Promise.all([db.from('abroad_pricing').select('config').eq('id',true).single(),db.from('abroad_requests').select('id,parent,email,phone,country,city,region,start_date,end_date,children,days,total_agorot,pricing_snapshot,status,created_at').order('created_at',{ascending:false}).limit(200)]);return p.error||r.error?reply({error:'unavailable'},503):reply({pricing:p.data.config,requests:r.data});}
export async function POST(req:NextRequest){if((await getCurrentStaff())?.role!=='admin'||req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'forbidden'},403);try{const b=await req.json(),db=getSupabaseAdmin();if(b.action==='pricing'){const c=pricingSchema.parse(b.config);const r=await db.from('abroad_pricing').update({config:c,updated_at:new Date().toISOString()}).eq('id',true);if(r.error)throw r.error;return reply({saved:true});}const c=z.object({id:z.string().uuid(),status:z.enum(['pending','contacted','closed'])}).strict().parse(b);const r=await db.from('abroad_requests').update({status:c.status}).eq('id',c.id).select('id').single();if(r.error)throw r.error;return reply({saved:true});}catch{return reply({error:'invalid'},400);}}
