import {redirect} from 'next/navigation';
import RequestForm from '@/components/treatments/RequestForm';
export const metadata={title:'פנייה לטיפול | طلب علاج | Magic Kids Institute'};
export default function Page({searchParams}:{searchParams:{lang?:string;treatment?:string}}){if(searchParams.treatment==='groups')redirect('/classes?lang='+encodeURIComponent(searchParams.lang??'ar'));return <RequestForm language={searchParams.lang==='he'||searchParams.lang==='en'?searchParams.lang:'ar'} initialTreatment={searchParams.treatment??'other'}/>;}
