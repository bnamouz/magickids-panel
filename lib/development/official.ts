import raw from '@/public/development-original/catalog.json';
export type Field={id:string;name:string;label:string;type:string;value:string;option:string;required:boolean;rect:number[]};
export type OriginalPage={page:number;width:number;height:number;role:string;image:string;fields:Field[]};
export const originals=raw as Record<string,{sha256:string;pages:OriginalPage[];widgets:number;uniqueFields:number}>;
export const OFFICIAL_VERSION='maccabi-upload-20261003-v1';
export function ageTemplate(birth:string,now=new Date()){
 const d=new Date(birth+'T00:00:00Z'),today=new Date(now.toISOString().slice(0,10)+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==birth||d>today)return null;
 const one=new Date(d);one.setUTCFullYear(one.getUTCFullYear()+1);const seven=new Date(d);seven.setUTCFullYear(seven.getUTCFullYear()+7);
 return today>=seven?null:today<one?'infant':'child';
}
export function officialPages(template:string,role:string){return originals[template]?.pages.filter(p=>p.role===role)??[];}
export function validOfficialAnswers(template:string,role:string,answers:Record<string,string>){
 const fields=officialPages(template,role).flatMap(p=>p.fields);if(!fields.length)return false;
 return Object.entries(answers).every(([key,value])=>fields.some(f=>f.id===key&&(f.type==='text'?value.length<=2000:value===''||value===f.value)));
}
export function officialSummary(row:any){
 const out=['ריכוז תשובות שאלוני מכבי המקוריים — ללא ציון תקני או אבחנה אוטומטית.',`גרסת מקור: ${row.form_version}`,`ערכה: ${row.form_template==='infant'?'עד גיל שנה':'גילאי 1–6'}`];
 for(const role of ['parent',row.education_role]){
  if(role==='none'){out.push('לפי הצהרת ההורה: הילד אינו במסגרת חינוכית. לא נדרש שאלון מסגרת במסלול זה.');continue;}
  const answers=role==='parent'?row.parent_answers:row.education_answers;
  out.push(role==='parent'?'דיווח הורים':role==='teacher'?'דיווח מורה':'דיווח גננת');
  const seen=new Set<string>();for(const p of officialPages(row.form_template,role))for(const f of p.fields){if(seen.has(f.id))continue;seen.add(f.id);const v=answers?.[f.id];if(!v)continue;const selected=p.fields.find(x=>x.id===f.id&&x.value===v);out.push(`עמוד ${p.page}, ${f.name}: ${f.type==='text'?v:selected?.option||v}`);}
 }
 return out.join('\n');
}
