import OnboardingForm from '@/components/intake/OnboardingForm';
export const metadata = { title: 'פתיחת תיק למרפאת הקשב | ילדי הקסם', referrer: 'no-referrer' as const };
export default function OnboardingPage({ params, searchParams }: { params: { token: string }; searchParams: { lang?: string } }) {
  return <OnboardingForm demo={params.token === 'demo'} initialLanguage={searchParams.lang === 'ar' || searchParams.lang === 'en' ? searchParams.lang : 'he'} />;
}
