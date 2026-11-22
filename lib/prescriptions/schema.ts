import { z } from 'zod';
import { nationalIdSchema } from '@/lib/shared/national-id';
import { asciiDigits } from '@/lib/phone-digits';
import { FUNDS } from '@/lib/booking/payments';

const line = (min: number, max: number) => z.string().trim().min(min).max(max).refine(v => !/[\r\n\x00-\x1f]/.test(v));
/** Israeli mobile or any international number, stored as +<country><number>. */
export function normalisePhone(raw: string): string | null {
  const text = asciiDigits(raw), digits = text.replace(/\D/g, '');
  const phone = text.startsWith('+') ? `+${digits}` : digits.startsWith('00') ? `+${digits.slice(2)}` : digits.startsWith('0') ? `+972${digits.slice(1)}` : `+${digits}`;
  return /^\+[1-9]\d{6,14}$/.test(phone) ? phone : null;
}
/** A real calendar day between 1920 and today. */
export function validBirthDate(value: string, now = Date.now()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value && value >= '1920-01-01' && time <= now;
}
/** The text fields of a renewal request, as the public form posts them (multipart, so every value is a string). */
export const renewalSchema = z.object({
  id: z.string().uuid(),
  months: z.enum(['1', '3']).transform(v => (v === '1' ? 1 : 3) as 1 | 3),
  method: z.enum(['bank', 'bit']),
  patientName: line(2, 100),
  nationalId: nationalIdSchema,
  birthDate: z.string().trim().refine(v => validBirthDate(v)),
  contactName: line(2, 100),
  phone: z.string().trim().max(30).transform(normalisePhone).refine((v): v is string => !!v),
  fund: z.enum(FUNDS),
  medication: line(2, 200),
  note: z.string().trim().max(500).refine(v => !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v)).optional(),
  language: z.enum(['he', 'ar', 'en']).default('ar'),
  consent: z.literal('true'),
  website: z.literal(''),
});
export type RenewalFields = z.infer<typeof renewalSchema>;
export const RENEWAL_FIELD_NAMES = ['id', 'months', 'method', 'patientName', 'nationalId', 'birthDate', 'contactName', 'phone', 'fund', 'medication', 'note', 'language', 'consent', 'website'] as const;

/** Recognises JPEG, PNG and PDF by their first bytes; the browser-reported type is not trusted. */
export function fileKind(b: Uint8Array): { type: 'image/jpeg' | 'image/png' | 'application/pdf'; ext: 'jpg' | 'png' | 'pdf' } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return { type: 'image/png', ext: 'png' };
  if ([0x25, 0x50, 0x44, 0x46, 0x2d].every((v, i) => b[i] === v)) return { type: 'application/pdf', ext: 'pdf' };
  return null;
}
