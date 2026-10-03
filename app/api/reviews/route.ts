import {NextRequest,NextResponse} from 'next/server';
import {createHmac} from 'crypto';
import {getSupabaseAdmin} from '@/lib/supabase';
import {reviewSchema} from '@/lib/reviews/schema';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){try{const r=await getSupabaseAdmin().from('clinic_reviews').select('id,display_name,service,rating,body,created_at').eq('status','approved').order('created_at',{ascending:false}).limit(50);if(r.error)throw r.error;return reply({reviews:r.data});}catch{return reply({error:'unavailable'},503);}}
export async function POST(req:NextRequest){if(req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'forbidden'},403);try{const raw=await req.text();if(raw.length>12000)return reply({error:'invalid'},413);const p=reviewSchema.safeParse(JSON.parse(raw));if(!p.success)return reply({error:'invalid'},400);const key=process.env.BOOKING_HASH_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)return reply({error:'unavailable'},503);const b=p.data;const r=await getSupabaseAdmin().rpc('submit_clinic_review',{p_id:b.id,p_name:b.display_name,p_service:b.service,p_rating:b.rating,p_body:b.body,p_ip:createHmac('sha256',key).update(req.ip||'unknown').digest('hex')});if(r.error)throw r.error;return r.data==='received'?reply({received:true}):reply({error:'rate_limited'},429);}catch{return reply({error:'unavailable'},503);}}
