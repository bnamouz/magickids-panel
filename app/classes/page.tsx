import InterestForm from '@/components/classes/InterestForm';
export const metadata={title:'חוגי המכון — רשימות מתעניינים | Magic Kids'};
export default function Page({searchParams}:{searchParams:{lang?:string;activity?:string}}){return <InterestForm language={searchParams.lang==='he'||searchParams.lang==='en'?searchParams.lang:'ar'} initial={searchParams.activity??''}/>;}
