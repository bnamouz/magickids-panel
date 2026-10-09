import {requireStaff} from '@/lib/admin/auth';
import {getSupabaseAdmin} from '@/lib/supabase';
import {classes,classLabels} from '@/lib/classes/catalog';
export const dynamic='force-dynamic';
export default async function Page(){
 await requireStaff();
 const r=await getSupabaseAdmin().from('class_interests').select('id,class_type,patient,contact,phone,email,language,created_at').order('created_at');
 return <div className="space-y-5">
  <h1 className="text-3xl font-bold">חוגי המכון · רשימות פתוחות</h1>
  <p>ההצטרפות היא לרשימת מתעניינים, אינה הרשמה סופית ואין גביית תשלום. המענה להורים במייל בלבד. כפתור הכנת המייל פותח את תוכנת הדואר שלכם עם נוסח לבדיקה; אין שמירה אוטומטית ב־Gmail או שליחה אוטומטית. לפני השליחה יש לוודא שחשבון השולח הוא magickids@magickidsinstitute.com.</p>
  {r.error?<p role="alert">לא ניתן לטעון את הרשימות.</p>:classes.map((c,i)=>{
   const rows=r.data?.filter(x=>x.class_type===c)??[];
   return <section key={c} className="card space-y-3">
    <h2 className="text-xl font-bold">{classLabels.he[i]} · {rows.length} מתעניינים</h2>
    {rows.length===0?<p>הרשימה פתוחה · טרם התקבלו פניות.</p>:rows.map(row=>{
     const lang=row.language as 'he'|'ar'|'en',title=classLabels[lang][i];
     const message=lang==='ar'
      ?`مرحبًا ${row.contact}، شكرًا لاهتمامكم بدورة ${title} في معهد أطفال السحر. تم استلام اهتمامكم، وسننسّق معكم عبر البريد عند توفر تفاصيل افتتاح المجموعة. هذه الرسالة ليست تأكيدًا لمقعد أو موعد أو دفع.\nمع التحية، سكرتارية معهد أطفال السحر | Magic Kids`
      :lang==='en'
       ?`Hello ${row.contact}, thank you for your interest in ${title} at Magic Kids Institute. We received your interest and will coordinate by email when the group's opening details are available. This message does not confirm a place, date or payment.\nKind regards, Magic Kids Institute administration`
       :`שלום ${row.contact}, תודה על ההתעניינות בחוג ${title} במכון ילדי הקסם. פנייתכם התקבלה, ונעדכן במייל כשיהיו פרטים על פתיחת הקבוצה. הודעה זו אינה אישור מקום, מועד או תשלום.\nבברכה, מזכירות מכון ילדי הקסם | Magic Kids`;
     return <div key={row.id} className="border-t py-3 space-y-2">
      <p>{row.patient} · הורה: {row.contact} · <bdi>{row.phone}</bdi></p>
      {row.email?<><p><bdi>{row.email}</bdi></p><a className="underline text-teal-700" href={`mailto:${encodeURIComponent(row.email)}?subject=${encodeURIComponent('Magic Kids · '+title)}&body=${encodeURIComponent(message)}`}>הכנת מייל להורה לבדיקה</a></>:<p className="text-amber-800">חסרה כתובת מייל · יש להשלים מול ההורה לפני הכנת מענה. הרשומה המקורית נשמרה.</p>}
     </div>;
    })}
   </section>;
  })}
 </div>;
}
