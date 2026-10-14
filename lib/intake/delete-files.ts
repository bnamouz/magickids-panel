import {getSupabaseAdmin} from '@/lib/supabase';
export async function cleanupCaseFiles(sessionId?:string){
 const db=getSupabaseAdmin();
 let q=db.from('case_deletion_jobs').select('session_id,report_paths').is('files_deleted_at',null).order('created_at').limit(20);
 if(sessionId)q=q.eq('session_id',sessionId);
 const {data,error}=await q;if(error)throw Error('cleanup_unavailable');
 let pending=0;
 for(const row of data??[]){
  try{
   const paths:string[]=row.report_paths??[];
   for(let i=0;i<paths.length;i+=100){const removed=await db.storage.from('reports').remove(paths.slice(i,i+100));if(removed.error)throw removed.error;}
   const saved=await db.from('case_deletion_jobs').update({report_paths:[],files_deleted_at:new Date().toISOString()}).eq('session_id',row.session_id);if(saved.error)throw saved.error;
  }catch{pending++;}
 }
 return {pending};
}
