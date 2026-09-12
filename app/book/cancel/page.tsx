import type { Metadata } from 'next';
import CancelBooking from '@/components/booking/CancelBooking';
export const metadata: Metadata = { title: 'ביטול תור | إلغاء موعد', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default function Page({searchParams}: {searchParams: {lang?: string}}) { return <CancelBooking language={searchParams.lang === 'he' || searchParams.lang === 'en' ? searchParams.lang : 'ar'} />; }
