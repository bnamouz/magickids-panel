import {NextRequest,NextResponse} from 'next/server';
import {createHmac} from 'crypto';
import {getSupabaseAdmin} from '@/lib/supabase';
import {publicCandidateSchema} from '@/lib/recruitment/schema';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'forbidden'},403);
 try{const raw=await req.text();if(raw.length>10000)return reply({error:'invalid_request'},400);const p=publicCandidateSchema.safeParse(JSON.parse(raw));if(!p.success)return reply({error:'invalid_request'},400);
 const secret=process.env.BOOKING_HASH_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;if(!secret)return reply({error:'unavailable'},503);
 const b=p.data,r=await getSupabaseAdmin().rpc('submit_recruitment',{p_id:b.id,p_name:b.name,p_email:b.email,p_phone:b.phone,p_treatments:b.treatments,p_experience:b.experience,p_ip:createHmac('sha256',secret).update(`recruitment:${req.ip||'unknown'}`).digest('hex')});
 if(r.error)return reply({error:'unavailable'},503);if(r.data!=='received')return reply({error:r.data},429);return reply({received:true});
 }catch{return reply({error:'unavailable'},503);}
}
