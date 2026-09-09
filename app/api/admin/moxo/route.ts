import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { notifyOnce } from '@/lib/moxo/notification';
const schema=z.object({id:z.string().uuid(),start:z.string().datetime(),duration:z.number().int().min(15).max(120),phone_verified:z.literal(true)}).strict();
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'forbidden'},{status:403});
 const staff=await getCurrentStaff();if(!staff)return NextResponse.json({error:'forbidden'},{status:403});
 try{
  const body=schema.parse(await req.json()),db=getSupabaseAdmin();
  const approved=await db.rpc('approve_moxo_request',{p_id:body.id,p_start:body.start,p_duration:body.duration,p_staff:staff.id});
  if(approved.error)return NextResponse.json({error:'unavailable'},{status:503});
  if(approved.data!=='approved')return NextResponse.json({error:approved.data},{status:409});
  const stored=await db.from('moxo_requests').select('*').eq('id',body.id).eq('status','approved').single();
  if(stored.error||!stored.data)return NextResponse.json({error:'unavailable'},{status:503});
  const row=stored.data;
  const when=new Intl.DateTimeFormat(row.language==='en'?'en-GB':`${row.language}-IL`,{timeZone:'Asia/Jerusalem',dateStyle:'full',timeStyle:'short'}).format(new Date(row.scheduled_at));
  const text=row.language==='ar'?`مرحبًا ${row.contact_name}، معهد أطفال السحر يؤكد موعد فحص MOXO: ${when} (توقيت إسرائيل). للاستفسار: 0544020043.`:row.language==='en'?`Hello ${row.contact_name}, Magic Kids Institute confirms your MOXO appointment: ${when} (Israel time). Questions: 0544020043.`:`שלום ${row.contact_name}, מכון ילדי הקסם מאשר את מועד מבדק MOXO: ${when} (שעון ישראל). לבירורים: 0544020043.`;
  const notification=await notifyOnce(`moxo:${row.id}`,row.phone,text);
  return NextResponse.json({approved:true,notification},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'invalid_request'},{status:400});}
}
