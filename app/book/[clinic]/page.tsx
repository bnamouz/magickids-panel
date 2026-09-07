import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { isClinic } from '@/lib/booking/schedule';
import BookingPage from '@/components/booking/BookingPage';

export const metadata: Metadata = { title: 'קביעת תור | حجز موعد | Magic Kids Institute', robots: { index: false, follow: true }, referrer: 'no-referrer' };
export default function Page({ params, searchParams }: { params: { clinic: string }; searchParams: { lang?: string } }) {
  if (!isClinic(params.clinic)) notFound();
  const language = searchParams.lang === 'he' || searchParams.lang === 'en' ? searchParams.lang : 'ar';
  if (params.clinic === 'adhd') redirect('/onboarding/public?lang=' + language);
  return <BookingPage key={params.clinic} clinic={params.clinic} initialLanguage={language} />;
}
