'use client';
import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import styles from '@/components/booking/booking.module.css';
type Language = 'he' | 'ar' | 'en';
const copy = {
  brand: ['מכון ילדי הקסם','معهد أطفال السحر','Magic Kids Institute'],
  clinic: ['מרפאת קשב וריכוז','عيادة الانتباه والتركيز','ADHD clinic'],
  title: ['מתחילים את תהליך האבחון','نبدأ مسار التقييم','Start the assessment process'],
  intro: ['לפני תיאום פגישה, פותחים תיק ומשלימים שאלון הורים ושאלון מורה. לאחר ששניהם נשלחו, התיק יופיע לצוות כמוכן לזימון.','قبل تنسيق الموعد، افتحوا ملفاً وأكملوا استبيان الأهل واستبيان المعلم. بعد إرسال الاثنين، يظهر الملف للطاقم كجاهز لتنسيق الموعد.','Before arranging an appointment, open a file and complete the parent and teacher questionnaires. Once both are submitted, the team will see the file as ready to schedule.'],
  steps: ['פתיחת תיק|שאלון הורים|שאלון מורה|תיאום פגישה','فتح ملف|استبيان الأهل|استبيان المعلم|تنسيق الموعد','Open a file|Parent questionnaire|Teacher questionnaire|Arrange appointment'],
  doctor: ['ד״ר בסים נמוז','الدكتور بسيم نموز','Dr. Basim Namouz'],
  role: ['רופא ילדים · אבחון קשב וריכוז','طبيب أطفال · تقييم اضطراب الانتباه والتركيز','Pediatrician · ADHD assessments'],
  form: ['פתיחת תיק חדש','فتح ملف جديد','Open a new file'],
  existing: ['כבר התחלתם? חזרו לקישור האישי שקיבלתם לשאלון. אין צורך לפתוח תיק נוסף.','بدأتم من قبل؟ عودوا إلى رابط الاستبيان الشخصي الذي تلقيتموه. لا حاجة لفتح ملف آخر.','Already started? Return to your personal questionnaire link. There is no need to open another file.'],
  headings: ['פרטי הילד/ה|פרטי המורה|פרטי ההורה והסכמה','تفاصيل الطفل/ة|تفاصيل المعلم/ة|تفاصيل ولي الأمر والموافقة','Child details|Teacher details|Parent details and consent'],
  first: ['שם פרטי','الاسم الأول','First name'], last: ['שם משפחה','اسم العائلة','Last name'],
  birth: ['תאריך לידה','تاريخ الميلاد','Date of birth'], gender: ['מין','الجنس','Sex'],
  genders: ['זכר|נקבה|אחר','ذكر|أنثى|آخر','Male|Female|Other'],
  grade: ['כיתה','الصف','Grade'], school: ['בית ספר','المدرسة','School'],
  teacherHint: ['אפשר להשלים את פרטי המורה בהמשך. אחרי שליחת שאלון ההורים תוכלו ליצור קישור אישי ולשלוח אותו למורה.','يمكن إكمال تفاصيل المعلم لاحقاً. بعد إرسال استبيان الأهل يمكنكم إنشاء رابط شخصي ومشاركته مع المعلم.','You can add teacher details later. After submitting the parent questionnaire, create a personal link to share with the teacher.'],
  teacherName: ['שם המורה (אופציונלי)','اسم المعلم/ة (اختياري)','Teacher name (optional)'],
  teacherPhone: ['טלפון המורה (אופציונלי)','هاتف المعلم/ة (اختياري)','Teacher phone (optional)'],
  relation: ['קירבה','صلة القرابة','Relationship'], relations: ['אם|אב|אפוטרופוס|אחר','أم|أب|وصي|آخر','Mother|Father|Guardian|Other'],
  name: ['שם מלא','الاسم الكامل','Full name'], phone: ['טלפון','الهاتف','Phone'], email: ['אימייל (אופציונלי)','البريد الإلكتروني (اختياري)','Email (optional)'],
  consent: ['אני מסכים/ה למסירת הפרטים ולעיבודם על ידי המכון לצורך תהליך האבחון ותיאום הפגישה.','أوافق على تقديم المعلومات ومعالجتها من قبل المعهد لغرض التقييم وتنسيق الموعد.','I consent to the institute processing the information I provide for the assessment process and appointment coordination.'],
  next: ['המשך','متابعة','Continue'], back: ['חזרה','رجوع','Back'],
  submit: ['פתיחת תיק והמשך לשאלון ההורים','فتح الملف والانتقال إلى استبيان الأهل','Open file and continue to parent questionnaire'],
  saving: ['פותחים את התיק…','جارٍ فتح الملف…','Opening your file…'],
  error: ['לא ניתן לפתוח כרגע את התיק. בדקו את הפרטים ונסו שוב, או צרו קשר עם המכון.','تعذّر فتح الملف حالياً. تحققوا من التفاصيل وحاولوا مرة أخرى أو تواصلوا مع المعهد.','Unable to open the file. Check the details and try again, or contact the institute.'],
  age: ['יש לוודא שתאריך הלידה נכון. תהליך זה מיועד לגיל 6 ומעלה.','يرجى التأكد من تاريخ الميلاد. هذا المسار مخصص لعمر 6 سنوات فما فوق.','Please check the date of birth. This process is for ages 6 and above.'],
  home: ['חזרה לאתר המכון','العودة إلى موقع المعهد','Institute website'], help: ['עזרה מהמכון','مساعدة من المعهد','Contact the institute'],
  clinicalLanguage: ['','الاستبيانات الطبية متاحة حالياً بالعبرية.','The clinical questionnaires are currently in Hebrew.'],
} as const;
type Data = { child_first_name:string; child_last_name:string; birth_date:string; gender:string; grade:string; school:string; teacher_name:string; teacher_phone:string; parent_name:string; parent_phone:string; parent_email:string; relation:string; consent:boolean };
export default function OnboardingForm({ demo, initialLanguage }: { demo:boolean; initialLanguage:Language }) {
  const router = useRouter(), [language,setLanguage] = useState(initialLanguage), [step,setStep] = useState(1);
  const [data,setData] = useState<Data>({child_first_name:'',child_last_name:'',birth_date:'',gender:'male',grade:'',school:'',teacher_name:'',teacher_phone:'',parent_name:'',parent_phone:'',parent_email:'',relation:'mother',consent:false});
  const [loading,setLoading] = useState(false), [error,setError] = useState('');
  const t = (key:keyof typeof copy) => copy[key][language === 'he' ? 0 : language === 'ar' ? 1 : 2];
  const origin = 'https://magickidsinstitute.com';
  useEffect(() => { document.documentElement.lang=language;document.documentElement.dir=language==='en'?'ltr':'rtl';const url=new URL(location.href);url.searchParams.set('lang',language);history.replaceState(null,'',url.pathname+url.search); },[language]);
  function update<K extends keyof Data>(key:K,value:Data[K]){setData(previous=>({...previous,[key]:value}));}
  async function next(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError('');
    if(step===1){const birth=new Date(data.birth_date),now=new Date();let age=now.getFullYear()-birth.getFullYear();if(now.getMonth()<birth.getMonth()||(now.getMonth()===birth.getMonth()&&now.getDate()<birth.getDate()))age--;if(!Number.isFinite(birth.getTime())||age<6||age>80){setError(t('age'));return;}}
    if(step<3){setStep(step+1);return;}if(loading||!data.consent)return;setLoading(true);
    try{const response=await fetch('/api/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok||!result.parent_token){setError(language==='he'&&typeof result.error==='string'?result.error:t('error'));return;}router.push('/questionnaire/parent/'+encodeURIComponent(result.parent_token));}catch{setError(t('error'));}finally{setLoading(false);}
  }
  const input=(key:Exclude<keyof Data,'consent'>,label:keyof typeof copy,type='text',required=false,maxLength=120)=><label key={key}><span>{t(label)}</span><input value={data[key]} onChange={event=>update(key,event.target.value)} type={type} required={required} maxLength={maxLength} minLength={type==='tel'&&required?7:undefined} dir={type==='tel'||type==='email'?'ltr':undefined}/></label>;
  const select=(key:'gender'|'relation',label:'gender'|'relation',values:string[],labels:'genders'|'relations')=><label><span>{t(label)}</span><select className="w-full border border-slate-300 rounded-lg p-3 bg-white" value={data[key]} onChange={event=>update(key,event.target.value)}>{values.map((value,index)=><option key={value} value={value}>{t(labels).split('|')[index]}</option>)}</select></label>;
  return <div className={styles.page} dir={language==='en'?'ltr':'rtl'} lang={language}>
    <header className={styles.header}><a className={styles.brand} href={origin+'/index.html?lang='+language}><img src={origin+'/assets/institute-logo.jpg'} width={56} height={56} alt=""/><span>{t('brand')}<small>MAGIC KIDS INSTITUTE</small></span></a><div className={styles.languages} role="group" aria-label="Language / שפה / اللغة">{(['ar','he','en'] as const).map(lang=><button key={lang} type="button" aria-pressed={language===lang} onClick={()=>setLanguage(lang)}>{lang==='ar'?'العربية':lang==='he'?'עברית':'EN'}</button>)}</div></header>
    <main className={styles.main}><aside className={styles.intro}><span className={styles.eyebrow}>{t('clinic')}</span><h1>{t('title')}</h1><p>{t('intro')}</p><ol className="space-y-3 mt-6">{t('steps').split('|').map((label,index)=><li key={label} className="flex items-center gap-3"><span className="w-7 h-7 rounded-full bg-white/15 text-center text-sm" aria-hidden="true">{index+1}</span>{label}</li>)}</ol><div className={styles.doctor}><img src={origin+'/assets/doctor.jpg'} width={72} height={88} alt={t('doctor')}/><div><strong>{t('doctor')}</strong><span>{t('role')}</span></div></div><a href="tel:+972544020043" className={styles.phone}><span>{t('help')}</span><b dir="ltr">054-402-0043</b></a><a className={styles.home} href={origin+'/index.html?lang='+language}>{t('home')}</a></aside>
    <section className={styles.panel} aria-labelledby="intake-title"><p className={styles.muted}>{t('existing')}</p><h2 id="intake-title">{t('form')}</h2><p className="text-sm text-[#01696f] mt-2 mb-4">{step} / 3 · {t('headings').split('|')[step-1]}</p><div className="flex gap-2 mb-6" aria-hidden="true">{[1,2,3].map(value=><span key={value} className={'h-1.5 flex-1 rounded-full '+(step>=value?'bg-[#075a5d]':'bg-slate-100')}/>)}</div>
    {demo?<a className={styles.primary} href="/questionnaire/parent/demo">מצב הדגמה — לשאלון</a>:<form onSubmit={next}><fieldset disabled={loading} className={styles.fields}><legend className="sr-only">{t('headings').split('|')[step-1]}</legend>
      {step===1&&<><div className="grid sm:grid-cols-2 gap-4">{input('child_first_name','first','text',true,80)}{input('child_last_name','last','text',true,80)}</div>{input('birth_date','birth','date',true)}{select('gender','gender',['male','female','other'],'genders')}<div className="grid sm:grid-cols-2 gap-4">{input('grade','grade')}{input('school','school')}</div></>}
      {step===2&&<><p className={styles.muted}>{t('teacherHint')}</p>{input('teacher_name','teacherName')}{input('teacher_phone','teacherPhone','tel',false,25)}</>}
      {step===3&&<>{select('relation','relation',['mother','father','guardian','other'],'relations')}{input('parent_name','name','text',true)}{input('parent_phone','phone','tel',true,25)}{input('parent_email','email','email',false,254)}<label className={styles.consent}><input type="checkbox" required checked={data.consent} onChange={event=>update('consent',event.target.checked)}/><span>{t('consent')}</span></label>{t('clinicalLanguage')&&<p className={styles.muted}>{t('clinicalLanguage')}</p>}</>}
    </fieldset>{error&&<p role="alert" className={styles.error}>{error}</p>}<div className="flex items-center gap-3 mt-3">{step>1&&<button type="button" disabled={loading} onClick={()=>{setStep(step-1);setError('');}} className="px-5 py-3 mt-5 rounded-xl border border-slate-300">{t('back')}</button>}<button type="submit" className={styles.primary} disabled={loading}>{t(loading?'saving':step===3?'submit':'next')}</button></div></form>}</section></main>
    <footer className={styles.footer}><span>{t('brand')}</span><a href="mailto:magickids@magickidsinstitute.com" dir="ltr">magickids@magickidsinstitute.com</a></footer>
  </div>;
}
