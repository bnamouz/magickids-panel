import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentStaff} from '@/lib/admin/auth';
import {getSupabaseAdmin} from '@/lib/supabase';
import {staffCandidateSchema} from '@/lib/recruitment/schema';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin||!await getCurrentStaff())return reply({error:'forbidden'},403);
 try{
 const raw=await req.text();if(raw.length>15000)return reply({error:'invalid_request'},400);const b=JSON.parse(raw),db=getSupabaseAdmin();
 if(b.action==='save'){
  const {id,...fields}=staffCandidateSchema.parse(b.profile);
  const q=id?db.from('recruitment_candidates').update({...fields,updated_at:new Date().toISOString()}).eq('id',id):db.from('recruitment_candidates').insert(fields);
  const r=await q.select('id').single();if(r.error)return reply({error:'save_failed'},409);return reply({saved:true});
 }
 const id=z.string().uuid().parse(b.id);
 if(b.action==='delete'&&b.confirmed===true){const r=await db.from('recruitment_candidates').delete().eq('id',id).select('id').single();if(r.error)return reply({error:'delete_failed'},409);return reply({deleted:true});}
 if(b.action==='accept'){const r=await db.rpc('accept_recruitment',{p_id:id});if(r.error)return reply({error:r.error.code==='23505'?'email_exists':'save_failed'},409);return reply({saved:true,converted:true});}
 return reply({error:'invalid_request'},400);
 }catch{return reply({error:'invalid_request'},400);}
}
