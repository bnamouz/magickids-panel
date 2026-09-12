import { z } from 'zod';
export const treatments = ['speech', 'occupational', 'emotional', 'parent-guidance', 'groups', 'other'] as const;
export const labels = {
 he: ['קלינאות תקשורת', 'ריפוי בעיסוק', 'טיפול רגשי', 'הדרכת הורים', 'חוגים וקבוצות', 'טיפול אחר'],
 ar: ['علاج النطق واللغة', 'العلاج الوظيفي', 'العلاج العاطفي', 'إرشاد الأهل', 'دورات ومجموعات', 'علاج آخر'],
 en: ['Speech and language', 'Occupational therapy', 'Emotional therapy', 'Parent guidance', 'Classes and groups', 'Other treatment'],
};
const name = z.string().trim().min(2).max(100).refine(v => !/[\x00-\x1f]/.test(v));
export const treatmentSchema = z.object({
 id: z.string().uuid(), patient: name, contact: name,
 phone: z.string().trim().transform(v => v.replace(/[\s()-]/g, '').replace(/^05/, '+9725').replace(/^972/, '+972')).pipe(z.string().regex(/^\+9725\d{8}$/)),
 treatment: z.enum(treatments), language: z.enum(['he','ar','en']),
 availability: z.string().trim().max(300), consent: z.literal(true), website: z.literal(''),
}).strict();
