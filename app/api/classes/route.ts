import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {classes} from '@/lib/classes/catalog';
import {treatmentSchema} from '@/lib/treatments/schema';
import {getSupabaseAdmin} from '@/lib/supabase';
const schema=treatmentSchema.pick({id:true,patient:true,contact:true,phone:true,language:true,consent:true,website:true}).extend({classType:z.enum(classes)}).strict();
export async function POST(req:NextRequest){
 const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'forbidden'},403);
 try{const raw=await req.text();if(raw.length>4096)return reply({error:'too_large'},413);const b=schema.safeParse(JSON.parse(raw));if(!b.success)return reply({error:'invalid'},400);
 const p=b.data;const r=await getSupabaseAdmin().rpc('submit_class_interest',{p_id:p.id,p_class:p.classType,p_patient:p.patient,p_contact:p.contact,p_phone:p.phone,p_language:p.language});
 if(r.error)return reply({error:'unavailable'},503);return r.data==='received'?reply({received:true}):reply({error:r.data},429);
 }catch{return reply({error:'unavailable'},503);}
}
