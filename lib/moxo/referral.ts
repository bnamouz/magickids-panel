/** The physician's referral a family may attach to a MOXO request. Kept in the private payments bucket under moxo/<request id>/. */
export const REFERRAL_BUCKET = 'adhd-payments';
/** The file travels in the same request as the details; the platform refuses bodies above 4.5 MB. */
export const MAX_REFERRAL_BYTES = 4 * 1024 * 1024;
/** Referral files accepted in 24 hours across all families. Past it the request is still saved and the family is asked to send the referral on WhatsApp. */
export const MAX_REFERRALS_PER_DAY = 40;
export const referralPath = (requestId: string, ext: string) => `moxo/${requestId}/referral.${ext}`;
