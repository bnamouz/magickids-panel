import { z } from 'zod';

export function normalizeNationalId(value: string) {
 return value.trim().replace(/[٠-٩]/g, d=>String(d.charCodeAt(0)-0x660))
  .replace(/[۰-۹]/g, d=>String(d.charCodeAt(0)-0x6f0));
}
export function validNationalId(value: string) {
 if(!/^\d{9}$/.test(value)||/^0+$/.test(value))return false;
 return [...value].reduce((sum,c,i)=>{const n=Number(c)*(i%2+1);return sum+(n>9?n-9:n);},0)%10===0;
}
export const nationalIdSchema=z.string().transform(normalizeNationalId).refine(validNationalId,'invalid_national_id');
export const nationalIdLabels={he:'תעודת זהות של הילד/ה (9 ספרות)',ar:'رقم هوية الطفل/ة (9 أرقام)',en:'Child’s Israeli ID number (9 digits)'};
