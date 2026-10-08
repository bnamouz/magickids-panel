import {redirect} from 'next/navigation';
import RequestForm from '@/components/treatments/RequestForm';
export const metadata={title:'פנייה לטיפול | طلب علاج | Magic Kids Institute'};
export default function Page({searchParams}:{searchParams:{lang?:string;treatment?:string}}){
 if(searchParams.treatment==='groups')redirect('/classes?lang='+encodeURIComponent(searchParams.lang??'ar'));
 const lang=searchParams.lang==='he'||searchParams.lang==='en'?searchParams.lang:'ar';
 const text={he:{title:'טיפול רגשי אצל רנא',link:'בחירת שעה ושליחת בקשה לאישור רנא',note:'אפשר גם למלא את הטופס הכללי להלן ללא בחירת שעה. פנייה שתשויך לרנא תופיע אצלה כממתינה לתיאום.'},ar:{title:'علاج عاطفي مع رنا',link:'اختيار موعد وإرسال طلب لموافقة رنا',note:'يمكن أيضًا إرسال النموذج العام أدناه دون اختيار ساعة. الطلب الذي يُسند لرنا يظهر لديها بانتظار التنسيق.'},en:{title:'Emotional therapy with Rana',link:'Choose a time and request Rana’s approval',note:'You can also submit the general form below without choosing a time. Referrals assigned to Rana appear in her queue awaiting scheduling.'}}[lang];
 return <><aside lang={lang} dir={lang==='en'?'ltr':'rtl'} className="max-w-3xl mx-auto my-5 p-5 rounded-lg border border-teal-200 bg-teal-50 space-y-2"><strong className="block text-teal-900">{text.title}</strong><a href="/therapy/rana" className="inline-block py-2 text-teal-800 underline font-semibold">{text.link}</a><p className="text-sm text-slate-700">{text.note}</p></aside><RequestForm language={lang} initialTreatment={searchParams.treatment??'other'}/></>;
}
