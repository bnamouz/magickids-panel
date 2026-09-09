import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { firstRelated, intakeProgress } from '@/lib/intake/progress';
import { BookingError } from '@/lib/booking/server';
import { normalisePhone } from '@/lib/voice-auth';
export async function voiceCase(id: string, phone: string, retryId?: string) {
 if (!z.string().uuid().safeParse(id).success || !normalisePhone(phone)) throw new BookingError('invalid_case',400);
 const db = getSupabaseAdmin();
 const result = await db.from('intake_sessions').select('id,patient_id,status,parent_token,parent_token_expires_at,patients(first_name,last_name),parents(full_name,phone)').eq('id',id).maybeSingle();
 if(result.error) throw new BookingError('unavailable');
 const session=result.data, parent=firstRelated<any>(session?.parents), patient=firstRelated<any>(session?.patients);
 if(!session || normalisePhone(parent?.phone)!==normalisePhone(phone)) throw new BookingError('case_not_found',404);
 const [forms,appointments]=await Promise.all([db.from('questionnaires').select('type,is_complete,submitted_at,responses').eq('session_id',id),db.from('appointments').select('id,status,appointment_type,scheduled_at').eq('session_id',id)]);
 if(forms.error||appointments.error) throw new BookingError('unavailable');
 const progress=intakeProgress(forms.data??[],(appointments.data??[]).filter(row=>row.id!==retryId),session.status);
 return {session,parent,patient,progress};
}
export function requireReady(progress: ReturnType<typeof intakeProgress>) {
 if(!progress.bothComplete) throw new BookingError('intake_incomplete',409);
 if(!progress.readyToSchedule) throw new BookingError('case_not_ready',409);
}
