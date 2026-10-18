import { z } from 'zod';
export const ALLOWED_ORIGINS = ['https://magickidsinstitute.com', 'https://www.magickidsinstitute.com', 'https://app.magickidsinstitute.com'];
const short = (n: number) => z.string().trim().max(n).optional().nullable().transform(v => (v ? v : null));
export const trackSchema = z.object({
  site: z.enum(['public', 'app']),
  event: z.enum(['view', 'click', 'step']),
  label: short(60),
  path: z.string().trim().min(1).max(200),
  lang: z.enum(['he', 'ar', 'en']).optional().nullable().transform(v => v ?? null),
  visitor: z.string().regex(/^[a-z0-9]{8,40}$/),
  session: z.string().regex(/^[a-z0-9]{8,40}$/).optional().nullable().transform(v => v ?? null),
  referrer: short(120),
  utm_source: short(60), utm_medium: short(60), utm_campaign: short(80),
  device: z.enum(['mobile', 'tablet', 'desktop']).optional().nullable().transform(v => v ?? null),
});
export type TrackEvent = z.infer<typeof trackSchema>;
