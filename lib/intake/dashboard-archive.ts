import {getSupabaseAdmin} from '@/lib/supabase';
export async function loadDashboardArchive(){
 const ids=new Set<string>(),db=getSupabaseAdmin();
 for(let offset=0;;offset+=200){
  const {data,error}=await db.from('dashboard_case_archive').select('session_id').order('session_id').range(offset,offset+199);
  if(error||!data)throw Error('archive_unavailable');
  for(const row of data)ids.add(row.session_id);
  if(data.length<200)return ids;
 }
}
