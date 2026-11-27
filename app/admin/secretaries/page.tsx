import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/admin/auth';
import SecretaryDesk from '@/components/admin/SecretaryDesk';
import { IMAGING_TYPES, MACCABI_BRANCH_EMAIL, MACCABI_IMAGING_EMAILS, REMINDER_AFTER_BUSINESS_DAYS, SERVICES } from '@/lib/maccabi/commitment-shared';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/admin/login');
  return <div className="space-y-5">
    <h1 className="text-3xl font-bold text-teal-800">מזכירות AI</h1>
    <p className="text-slate-700">שלוש מזכירות עובדות במערכת: שרה (טלפון המכון), נור (טלפון מרפאת הילדים) והמזכירה האישית. בבקשות התחייבות ממכבי, המזכירה האישית שולחת את הבקשה לסניף, בודקת את תיבת המייל כל בוקר, שולחת תזכורת אחרי {REMINDER_AFTER_BUSINESS_DAYS} ימי עסקים ללא מענה, ומעדכנת את המשפחה ב־WhatsApp כשההתחייבות מוכנה. באותה עמדה מטפלים גם באישורי בדיקות דימות, בבקשות לאישור תרופות ובערעורי רופא על החלטות מכבי בנוגע לתרופות.</p>
    <div className="grid gap-4 md:grid-cols-3">
      <section className="card space-y-1"><h2 className="font-bold text-teal-900">שרה · 054-402-0043</h2><p className="text-sm text-slate-600">מזכירת המכון בטלפון וב־WhatsApp: קשב, MOXO, טיפולים, חוגים. <a className="underline text-teal-700" href="/admin/calls">לשיחות שרה</a></p></section>
      <section className="card space-y-1"><h2 className="font-bold text-teal-900">נור · 054-349-6656</h2><p className="text-sm text-slate-600">מזכירת מרפאת הילדים: תורים לרופא, אישורים ותזכורות. <a className="underline text-teal-700" href="/admin/personal/calls">לשיחות נור</a></p></section>
      <section className="card space-y-1"><h2 className="font-bold text-teal-900">המזכירה האישית · מכבי</h2><p className="text-sm text-slate-600">התחייבויות מול סניף מכבי שפרעם (<bdi dir="ltr" className="[overflow-wrap:anywhere]">{MACCABI_BRANCH_EMAIL}</bdi>), אישורי בדיקות דימות, אישורי תרופות וערעורי רופא. העמדה מרכזת מעקב ועדכונים למשפחה.</p></section>
    </div>
    <SecretaryDesk services={[...SERVICES]} imagingTypes={[...IMAGING_TYPES]} branchEmail={MACCABI_BRANCH_EMAIL} imagingEmails={[...MACCABI_IMAGING_EMAILS]} staffName={staff.full_name} />
  </div>;
}
