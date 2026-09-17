import { z } from 'zod';
// TEMPORARY: test destination — MUST be reverted to 'zfn_shraam_child@mac.org.il' before real use
export const DESTINATION = 'bnamouz@gmail.com';
export const VERSION = 'development-intake-2026-09-v1';
export const SOURCE = 'https://www.maccabi4u.co.il/maccabi_circles/child_development/questionnaire/child_development_questionnaire/';
// These are an institute intake supplement, not a certified replica of Maccabi forms.
// Official completed forms must be attached before dispatch until mapping is approved.
export const RATINGS = ['ללא קושי מדווח', 'קושי מסוים', 'קושי ניכר', 'לא רלוונטי / לא ידוע'] as const;
export const domains = {
 parent: ['תנועה ופעילות גופנית','שימוש בידיים','רגישות לחושים','קשב והתמדה','המתנה ושליטה בתגובה','התארגנות','יוזמה ומשחק','הבנת שפה והבעה','בהירות הדיבור','תקשורת עם הסביבה','למידה וזיכרון','התנהגות','קשרים חברתיים','רגשות','אכילה ועצמאות','שינה'],
 kindergarten: ['לעיסה ותפקודי פה','בהירות הדיבור','הבעה ומילים','הבנת הוראות','זיכרון ומושגים','ציור וגזירה','בנייה והרכבה','השתתפות בקבוצה','משחק דמיון','משחק בחצר','תנועה ומוזיקה','קשב והתמדה','המתנה לתור','פעילות יתר','אכילה ולבוש','גמילה','חברויות','הבנת מצבים חברתיים','יוזמה','פתרון מחלוקות','קשר עם הצוות','תגובה לחושים','נוכחות והסתגלות','פרידה מההורים'],
 teacher: ['כתיבה','חשבון','קריאה','הבנת טקסט','קריאות כתב היד','קצב כתיבה','מאמץ בכתיבה','ארגון הדף','השלמת משימות','עמידה בזמנים','עבודה עצמאית','ארגון ציוד','ביצוע הוראות','משחק בכדור','פעילות בהפסקות','ספורט ותנועה','עייפות','קשרים חברתיים','משחק משותף','פתרון מחלוקות','התחשבות באחרים','השתלבות חברתית','תגובות רגשיות','התמודדות עם תסכול','המתנה ושליטה עצמית','קבלת גבולות','קשב ביחידות','קשב בקבוצה','ישיבה בפעילות','התמדה','רגישות לחושים']
} as const;
export type Role = keyof typeof domains;
export const registration = z.object({child_name:z.string().trim().min(2).max(100),birth_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),parent_name:z.string().trim().min(2).max(100),phone:z.string().regex(/^0\d{8,9}$/),education_role:z.enum(['kindergarten','teacher']),consent:z.literal(true)}).strict();
export const answersSchema = z.record(z.string().max(80),z.string().max(3000)).refine(x=>Object.keys(x).length<=100);
export const labels: Record<string,string> = {reason:'סיבת הפנייה והעזרה המבוקשת',history:'רקע רפואי, היריון ולידה, אבחונים וטיפולים קודמים',family:'רקע משפחתי ושפות בבית',respondent:'שם ממלא/ת השאלון',setting:'שם המסגרת, כיתה/קבוצה ומשך ההיכרות',support:'סיוע וטיפולים במסגרת',strengths:'חוזקות ותחומי עניין',notes:'מידע נוסף ודוגמאות מהיומיום',signature:'שם מלא לאישור נכונות התשובות'};
export function validateAnswers(role:Role, answers:Record<string,string>) {
 const required = role==='parent'?['reason','history','family','respondent','strengths','signature']:['respondent','setting','support','strengths','signature'];
 return required.every(k=>!!answers[k]?.trim()) && domains[role].every((_,i)=>RATINGS.includes(answers['d'+i] as any));
}
export function ageEligible(date:string, now=new Date()) { const d=new Date(date+'T00:00:00Z'); if(!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==date)return false; const min=new Date(now.toISOString().slice(0,10)+'T00:00:00Z');min.setUTCFullYear(min.getUTCFullYear()-7); const max=new Date(now.toISOString().slice(0,10)+'T00:00:00Z');max.setUTCFullYear(max.getUTCFullYear()-1);return Number.isFinite(d.getTime()) && d>min && d<=max; }
export function summary(parent:Record<string,string>, education:Record<string,string>, role:'teacher'|'kindergarten') {
 const section=(name:string,r:Role,a:Record<string,string>)=>[name,...domains[r].map((label,i)=>`${label}: ${a['d'+i]||'חסר'}${a['n'+i]?' — '+a['n'+i]:''}`),...Object.entries(labels).filter(([k])=>a[k]).map(([k,v])=>`${v}: ${a[k]}`)].join('\n');
 return ['טיוטת ריכוז דיווחים — אינה אבחנה רפואית. לא חושב ציון תקני.','המידע מוצג לפי מקורו; הבדלים בין סביבות דורשים בירור קליני.',section('דיווח ההורים','parent',parent),section(role==='teacher'?'דיווח המורה':'דיווח הגננת',role,education)].join('\n\n');
}
