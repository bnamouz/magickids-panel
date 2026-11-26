import { requireStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { treatments } from '@/lib/treatments/schema';
import { listTreatmentChanges } from '@/lib/therapists/appointment-changes';
import StaffTreatmentList, { treatmentStateNames, type TreatmentFilters } from '@/components/treatments/StaffTreatmentList';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: TreatmentFilters }) {
  await requireStaff();
  let query = getSupabaseAdmin().from('treatment_requests')
    .select('id,patient_name,national_id,contact_name,phone,treatment,language,availability,status,therapist,scheduled_at,duration_minutes,created_at,therapist_id,calendar_sync,therapists(name,duration)')
    .order('created_at', { ascending: true }).limit(200);
  if (treatments.includes(searchParams.treatment as typeof treatments[number])) query = query.eq('treatment', searchParams.treatment!);
  if (searchParams.status && Object.hasOwn(treatmentStateNames, searchParams.status)) query = query.eq('status', searchParams.status);
  else query = query.neq('status', 'closed');

  const result = await query;
  const history = result.data?.length
    ? await listTreatmentChanges(result.data.map(row => row.id)).catch(() => ({}))
    : {};
  return <StaffTreatmentList filters={searchParams} rows={result.data} error={!!result.error} history={history} />;
}
