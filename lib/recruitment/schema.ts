import {z} from 'zod';
import {treatments} from '@/lib/treatments/schema';
export const statuses={new:'חדש',contacted:'נוצר קשר',interview:'ראיון',accepted:'התקבל/ה',rejected:'נדחה/תה'};
export const candidateSchema=z.object({name:z.string().trim().min(2).max(100),email:z.string().trim().email().max(254).transform(s=>s.toLowerCase()),phone:z.string().trim().regex(/^[+\d\s()-]{7,25}$/),treatments:z.array(z.enum(treatments)).min(1).max(6),experience:z.string().trim().max(3000)});
export const staffCandidateSchema=candidateSchema.extend({id:z.string().uuid().optional(),notes:z.string().max(5000),status:z.enum(['new','contacted','interview','accepted','rejected'])}).strict();
export const publicCandidateSchema=candidateSchema.extend({id:z.string().uuid(),consent:z.literal(true),website:z.literal('')}).strict();
export type Candidate=z.infer<typeof staffCandidateSchema>&{id:string;therapist_id:string|null;created_at:string};
