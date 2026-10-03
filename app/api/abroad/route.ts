import {NextRequest,NextResponse} from 'next/server';
import {createHmac} from 'crypto';
import {getSupabaseAdmin} from '@/lib/supabase';
import {requestSchema,quote} from '@/lib/abroad/quote';
export const dynamic='force-dynamic';
const reply=(b:unknown,s=200)=>NextResponse.json(b,{status:s,headers:{'Cache-Control':'no-store'}});
export async function GET(){try{const r=await getSupabaseAdmin().from('abroad_pricing').select('config').eq('id',true).single();if(r.error)throw r.error;return reply({pricing:r.data.config});}catch{return reply({error:'unavailable'},503);}}
export async function POST(req:NextRequest){if(req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'forbidden'},403);try{const raw=await req.text();if(raw.length>6000)return reply({error:'invalid'},413);const p=requestSchema.safeParse(JSON.parse(raw));if(!p.success)return reply({error:'invalid'},400);const db=getSupabaseAdmin(),r=await db.from('abroad_pricing').select('config').eq('id',true).single();if(r.error)throw r.error;const q=quote(r.data.config,p.data);if(p.data.end<new Date().toISOString().slice(0,10))return reply({error:'past_dates'},400);const key=process.env.BOOKING_HASH_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw Error();const save=await db.rpc('submit_abroad_request',{p_data:{...p.data,...q},p_ip:createHmac('sha256',key).update(req.ip||'unknown').digest('hex')});if(save.error)throw save.error;return save.data==='received'?reply({received:true,...q}):reply({error:'rate_limited'},429);}catch{return reply({error:'unavailable'},503);}}
