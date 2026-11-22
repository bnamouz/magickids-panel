import { withVat } from '@/lib/booking/payments';

/** Prescription renewal for ADHD patients, one or three months. Base prices are before VAT; families pay the price with VAT. */
export const RENEWAL_MONTHS = [1, 3] as const;
export type RenewalMonths = typeof RENEWAL_MONTHS[number];
export const RENEWAL_BASE: Record<RenewalMonths, number> = { 1: 300, 3: 500 };
export const RENEWAL_PRICE: Record<RenewalMonths, number> = { 1: withVat(RENEWAL_BASE[1]), 3: withVat(RENEWAL_BASE[3]) };
export const isRenewalMonths = (n: unknown): n is RenewalMonths => n === 1 || n === 3;
/** Attached files travel in one request; the platform refuses bodies above 4.5 MB. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
export const MAX_SUMMARY_FILES = 3;
