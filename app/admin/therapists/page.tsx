import Link from 'next/link';
import {requireStaff} from '@/lib/admin/auth';
import {getSupabaseAdmin} from '@/lib/supabase';
import {mailConfigured} from '@/lib/therapists/mail';
import {calendarConfigured} from '@/lib/therapists/calendar';
import Manager from '@/components/therapists/Manager';
export const dynamic='force-dynamic';
export default async function Page(){
 await requireStaff();const db=getSupabaseAdmin();const [r,worker]=await Promise.all([db.from('therapists').select('id,name,email,treatments,active,duration,hours,leave_dates,token_expires_at').order('name'),db.from('treatment_worker_state').select('last_run').eq('id',true).maybeSingle()]);
 const running=worker.data?.last_run&&Date.now()-Date.parse(worker.data.last_run)<10*60000;
 return <section className="space-y-5"><h1 className="text-3xl font-bold text-teal-800">ניהול מטפלים וזמינות</h1><p>מטפל מתאים אחד עם זמן פנוי יקבל את הפנייה אוטומטית. כשיש כמה מתאימים או אין זמינות, הצוות בוחר למי להעביר אותה. המועד נקבע רק לאחר תיאום עם ההורים.</p><Link href="/admin/treatments" className="underline">לפניות ולשיבוץ טיפולים</Link><div className="card space-y-2"><h2 className="font-bold">מצב חיבורי המערכת</h2><p>מייל: {mailConfigured()?'פרטי חיבור קיימים — אישור שליחה מופיע בכל פנייה':'לא מוגדר; ניתן להעתיק קישור ידנית'}</p><p>יומן Google: {calendarConfigured()?'פרטי חיבור קיימים — יש לבדוק את מצב הסנכרון בכל תור':'לא מוגדר'}</p><p>WhatsApp: {process.env.ULTRAMSG_INSTANCE_ID&&process.env.ULTRAMSG_TOKEN?'פרטי חיבור קיימים':'לא מוגדר'}</p><p>אימות שירות התזכורות: {process.env.CRON_SECRET && process.env.CRON_SECRET.length>=32?'מוגדר':'נדרש CRON_SECRET באורך 32 תווים לפחות'}</p><p>תזכורות אוטומטיות: {running?'העובד האוטומטי רץ לאחרונה':'טרם אומתה הרצה סדירה — אין להסתמך על שליחה אוטומטית'}</p><p className="text-sm text-slate-500">התזכורות מיועדות לשעתיים לפני הטיפול; בהרצה מאוחרת הן נשלחות רק עד שעה לפניו. להורים נשלחת תזכורת רק לאחר הסכמה.</p></div>{r.error?<p role="alert">לא ניתן לטעון מטפלים. יש לבדוק שהעדכון למסד הנתונים הוחל.</p>:<Manager profiles={r.data??[]}/>}</section>;
}
