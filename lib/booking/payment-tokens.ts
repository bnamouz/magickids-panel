import { createHash, randomBytes } from 'node:crypto';

export const newBookingToken = () => randomBytes(24).toString('hex');
export const tokenHash = (t: string) => createHash('sha256').update(`adhd-pay:v1:${t}`).digest('hex');
export const isBookingToken = (t: unknown): t is string => typeof t === 'string' && /^[0-9a-f]{48}$/.test(t);
