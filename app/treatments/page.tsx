import {redirect} from 'next/navigation';
import RequestForm from '@/components/treatments/RequestForm';
import {getSupabaseAdmin} from '@/lib/supabase';
import {treatmentLabels} from '@/lib/therapists/parent-booking';
export const metadata={title:'פנייה לטיפול | طلب علاج | Magic Kids Institute'};
export const dynamic='force-dynamic';
/** Every therapist with an enabled booking profile gets a request card; the general form stays below. */
async function bookable(){
 const db=getSupabaseAdmin();
 const p=await db.from('therapist_booking_profiles').select('slug,therapist_id').eq('enabled',true);
 if(p.error||!p.data?.length)return [];
 const t=await db.from('therapists').select('id,name,treatments,active').in('id',p.data.map(x=>x.therapist_id)).eq('active',true).is('archived_at',null);
 return (t.data??[]).map(x=>({slug:p.data!.find(y=>y.therapist_id===x.id)!.slug,name:x.name,labels:treatmentLabels(x.treatments)})).sort((a,b)=>a.name.localeCompare(b.name,'he'));
}
export default async function Page({searchParams}:{searchParams:{lang?:string;treatment?:string}}){
 if(searchParams.treatment==='groups')redirect('/classes?lang='+encodeURIComponent(searchParams.lang??'ar'));
 const lang=searchParams.lang==='he'||searchParams.lang==='en'?searchParams.lang:'ar';
 const list=await bookable().catch(()=>[]);
 const t=(name:string,first:string,label:string)=>({
  he:{title:`${label} אצל ${name}`,link:`בחירת שעה ושליחת בקשה לאישור ${first}`,note:`אפשר גם למלא את הטופס הכללי להלן ללא בחירת שעה. פנייה שתשויך ל${first} תופיע אצלה כממתינה לתיאום.`},
  ar:{title:`${label} مع ${name}`,link:`اختيار موعد وإرسال طلب لموافقة ${first}`,note:`يمكن أيضًا إرسال النموذج العام أدناه دون اختيار ساعة. الطلب الذي يُسند لـ${first} يظهر لديها بانتظار التنسيق.`},
  en:{title:`${label} with ${name}`,link:`Choose a time and request ${first}’s approval`,note:`You can also submit the general form below without choosing a time. Referrals assigned to ${first} appear in their queue awaiting scheduling.`},
 }[lang]);
 return <>{list.map(x=>{const text=t(x.name,x.name.split(' ')[0],x.labels[lang]);return <aside key={x.slug} lang={lang} dir={lang==='en'?'ltr':'rtl'} className="max-w-3xl mx-auto my-5 p-5 rounded-lg border border-teal-200 bg-teal-50 space-y-2"><strong className="block text-teal-900">{text.title}</strong><a href={`/therapy/${x.slug}`} className="inline-block py-2 text-teal-800 underline font-semibold">{text.link}</a><p className="text-sm text-slate-700">{text.note}</p></aside>;})}<RequestForm language={lang} initialTreatment={searchParams.treatment??'other'}/></>;
}
