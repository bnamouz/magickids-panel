import { z } from 'zod';
import { treatments } from '@/lib/treatments/schema';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
export const availabilitySchema=z.object({
 hours:z.array(z.object({day:z.number().int().min(0).max(6),start:z.number().int().min(0).max(1439),end:z.number().int().min(1).max(1439)}).strict().refine(v=>v.end>v.start)).max(28),
 leave_dates:z.array(z.object({start:date,end:date}).strict().refine(v=>v.end>=v.start)).max(100),
}).strict().refine(v=>!v.hours.some((h,i)=>v.hours.some((b,j)=>i<j&&h.day===b.day&&h.start<b.end&&h.end>b.start)),{message:'שעות העבודה חופפות'});
export const profileSchema=z.object({id:z.string().uuid().optional(),name:z.string().trim().min(2).max(100),email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),treatments:z.array(z.enum(treatments)).min(1).max(6),active:z.boolean(),duration:z.number().int().min(15).max(180),hours:z.unknown(),leave_dates:z.unknown()}).strict().superRefine((v,ctx)=>{const p=availabilitySchema.safeParse({hours:v.hours,leave_dates:v.leave_dates});if(!p.success)ctx.addIssue({code:'custom',message:'שעות או חופשות אינן תקינות'});});
export type Availability = z.infer<typeof availabilitySchema>;
export type Therapist = Availability & {id:string;name:string;email:string;treatments:string[];active:boolean;duration:number;token_version:string;token_expires_at:string};
