import RequestForm from '@/components/treatments/RequestForm';
export const metadata={title:'פנייה לטיפול | طلب علاج | Magic Kids Institute'};
export default function Page({searchParams}:{searchParams:{lang?:string;treatment?:string}}){return <RequestForm language={searchParams.lang==='he'||searchParams.lang==='en'?searchParams.lang:'ar'} initialTreatment={searchParams.treatment??'other'}/>;}
