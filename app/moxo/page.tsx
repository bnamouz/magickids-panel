import { getSupabaseAdmin } from '@/lib/supabase';
export const dynamic='force-dynamic';
import RequestForm from '@/components/moxo/RequestForm';
export const metadata={title:'MOXO | Magic Kids Institute',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:{lang?:string}}){let enabled=false;try{const result=await getSupabaseAdmin().from('moxo_requests').select('id').limit(0);enabled=!result.error;}catch{} const language=searchParams.lang==='he'?'he':searchParams.lang==='en'?'en':'ar';return <main className="min-h-screen bg-slate-50 p-5 sm:p-10"><a className="block text-center mb-6 text-teal-800" href={`https://magickidsinstitute.com/index.html?lang=${language}`}><img src="https://magickidsinstitute.com/assets/institute-logo.jpg" alt="Magic Kids Institute" width="80" height="80" className="mx-auto mb-2"/>Magic Kids Institute · מכון ילדי הקסם · معهد أطفال السحر</a><RequestForm language={language} enabled={enabled}/></main>;}
