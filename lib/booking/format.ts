import type { BookingLanguage } from './copy';

/** Keep translated date labels, but always display Western digits (0–9). */
export function bookingLocale(language: BookingLanguage): string {
  const locale = language === 'en' ? 'en-GB' : `${language}-IL`;
  return `${locale}-u-nu-latn`;
}
