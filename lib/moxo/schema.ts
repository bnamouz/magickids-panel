import { z } from 'zod';
const name=z.string().trim().min(2).max(100).refine(s=>!/[\r\n\x00-\x1f]/.test(s));
export const moxoSchema=z.object({id:z.string().uuid(),patient_name:name,contact_name:name,phone:z.string().regex(/^\+9725\d{8}$/),language:z.enum(['he','ar','en']),preferred_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),consent:z.literal(true),website:z.literal('').default('')}).strict();
