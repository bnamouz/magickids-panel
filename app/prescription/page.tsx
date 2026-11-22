import { getSupabaseAdmin } from '@/lib/supabase';
import RenewalForm from '@/components/prescriptions/RenewalForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'חידוש מרשם | تجديد وصفة طبية | Magic Kids Institute', robots: { index: false, follow: false } };

/** Public prescription-renewal request for patients who already had an ADHD assessment. */
export default async function Page({ searchParams }: { searchParams: { lang?: string } }) {
  let enabled = false;
  try { const r = await getSupabaseAdmin().from('prescription_renewal_requests').select('id').limit(0); enabled = !r.error; } catch {}
  const language = searchParams.lang === 'he' ? 'he' : searchParams.lang === 'en' ? 'en' : 'ar';
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-10">
    <a className="mb-6 block text-center text-teal-800" href={`https://magickidsinstitute.com/index.html?lang=${language}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="https://magickidsinstitute.com/assets/institute-logo.jpg" alt="Magic Kids Institute" width="80" height="80" className="mx-auto mb-2" />
      Magic Kids Institute · מכון ילדי הקסם · معهد أطفال السحر
    </a>
    <RenewalForm language={language} enabled={enabled} />
  </main>;
}
