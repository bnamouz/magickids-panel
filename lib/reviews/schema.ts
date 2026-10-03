import {z} from 'zod';
export const reviewSchema=z.object({id:z.string().uuid(),display_name:z.string().trim().min(2).max(60),service:z.enum(['pediatrics','adhd']),rating:z.number().int().min(1).max(5),body:z.string().trim().min(10).max(1500),consent:z.literal(true),website:z.literal('')}).strict();
