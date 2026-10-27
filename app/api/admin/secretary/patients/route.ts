import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { asciiDigits } from '@/lib/phone-digits';
import { guard, reply } from '../_guard';
export const dynamic = 'force-dynamic';
/** Quick search in the pediatric-clinic patient list (name / ת.ז. / phone) for the commitment form. */
export async function GET(req: NextRequest) {
  const g = await guard(req); if ('error' in g) return g.error;
  const q = asciiDigits((req.nextUrl.searchParams.get('q') ?? '').trim()).slice(0, 60);
  if (q.length < 2) return reply({ patients: [] });
  const db = getSupabaseAdmin();
  const safe = q.replace(/[%_,()]/g, ' ').trim();
  const parts = safe.split(/\s+/).filter(Boolean);
  let query = db.from('clinic_patients').select('id, first_name, last_name, national_id, phone1, phone2, birth_date').is('archived_at', null).limit(10);
  if (/^\d+$/.test(safe)) query = query.or(`national_id.ilike.%${safe}%,phone1.ilike.%${safe}%,phone2.ilike.%${safe}%`);
  else for (const p of parts) query = query.or(`first_name.ilike.%${p}%,last_name.ilike.%${p}%`);
  const { data, error } = await query;
  if (error) return reply({ error: 'db' }, 503);
  return reply({ patients: (data ?? []).map((p) => ({ id: p.id, name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(), national_id: p.national_id, phone: p.phone1 || p.phone2 || '', birth_date: p.birth_date })) });
}
