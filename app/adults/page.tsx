import AdultOnboardingForm from '@/components/intake/AdultOnboardingForm';
export const metadata = {
  title: 'אבחון קשב וריכוז למבוגרים | ילדי הקסם',
  description: 'פתיחת תיק לאבחון הפרעת קשב וריכוז למבוגרים ומילוי שאלון הערכה עצמית, לקראת פגישת אבחון עם הרופא.',
  referrer: 'no-referrer' as const,
};
/** Public entry to the adult ADHD assessment track. */
export default function AdultsPage({ searchParams }: { searchParams: { lang?: string } }) {
  return <AdultOnboardingForm initialLanguage={searchParams.lang === 'ar' || searchParams.lang === 'en' ? searchParams.lang : 'he'} />;
}
