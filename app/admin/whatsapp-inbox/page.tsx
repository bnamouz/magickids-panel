import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { readConfig } from '@/lib/institute-wa/guards';
import WhatsAppInboxActions from '@/components/admin/WhatsAppInboxActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'וואטסאפ המכון — תיבת פניות | Magic Kids', robots: { index: false, follow: false } };

const MODE_LABEL = { off: 'כבוי — הודעות נרשמות בלבד', shadow: 'מצב צל — טיוטות נשמרות ואינן נשלחות', on: 'פעיל — תשובות נשלחות למשפחות' } as const;
const REASON_LABEL: Record<string, string> = {
  auto_reply_cap: 'הגיע למכסת תשובות אוטומטיות בשיחה', global_cap: 'הגיע למכסת התשובות הכללית לשעה', ai_failed: 'הבוט לא הצליח לנסח תשובה',
  urgent: 'פנייה דחופה', complaint: 'תלונה', document_request: 'בקשת מסמך', send_failed: 'שליחה נכשלה', send_uncertain: 'תוצאת שליחה לא ודאית',
};
function reasonLabel(r: string | null) {
  if (!r) return '';
  const key = r.split(':')[0].trim();
  if (key === 'non_text') return 'הודעה שאינה טקסט (קול/תמונה/מסמך)';
  return REASON_LABEL[key] ? `${REASON_LABEL[key]}${r.includes(':') ? ` — ${r.slice(r.indexOf(':') + 1).trim()}` : ''}` : r;
}
const fmt = (v: string | null) => v ? new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }).format(new Date(v)) : '';
const local = (p: string) => p.startsWith('972') ? `0${p.slice(3)}` : p;
const clean = (s: string | null) => String(s ?? '').replace(/[\u200b\u2063]/g, '');

export default async function Page({ searchParams }: { searchParams: { chat?: string } }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/admin/login?redirect=/admin/whatsapp-inbox');
  const db = getSupabaseAdmin();
  const mode = readConfig().mode;
  const chats = await db.from('institute_wa_chats').select('*').order('needs_staff', { ascending: false }).order('last_inbound_at', { ascending: false, nullsFirst: false }).limit(200);
  const selected = /^[0-9]{6,20}$/.test(searchParams.chat ?? '') ? searchParams.chat! : null;
  const chat = selected ? chats.data?.find((c) => c.chat_phone === selected) ?? null : null;
  const messages = chat ? await db.from('institute_wa_messages').select('id,direction,body,type,mode,status,created_at,meta').eq('chat_phone', chat.chat_phone).neq('direction', 'bot_echo').order('created_at', { ascending: true }).limit(200) : null;
  const now = Date.now();
  const isPaused = (c: { paused_until: string | null }) => !!c.paused_until && new Date(c.paused_until).getTime() > now;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-teal-800">וואטסאפ המכון — תיבת פניות</h1>
        <p className="text-sm text-slate-600">מענה אוטומטי במספר המכון 054-402-0043. הבוט עונה רק בשיחה שבה נשאלה השאלה ואינו מעביר הודעות למספרים אחרים. פניות שדורשות צוות מופיעות ראשונות.</p>
      </div>
      <p className={`rounded-full px-4 py-2 text-sm font-semibold ${mode === 'on' ? 'bg-teal-700 text-white' : mode === 'shadow' ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-800'}`}>מצב הבוט: {MODE_LABEL[mode]}</p>
    </div>
    {chats.error ? <p role="alert" className="card text-red-700">לא ניתן לטעון את השיחות. יש לוודא שעדכון הטבלאות של בוט הוואטסאפ הוחל במסד הנתונים.</p> :
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <nav aria-label="שיחות" className="card max-h-[75vh] space-y-1 overflow-y-auto p-2">
        {!chats.data?.length && <p className="p-3 text-sm">אין שיחות עדיין.</p>}
        {chats.data?.map((c) => <Link key={c.chat_phone} href={`/admin/whatsapp-inbox?chat=${c.chat_phone}`} aria-current={c.chat_phone === selected ? 'page' : undefined}
          className={`block rounded-xl border p-3 text-sm ${c.chat_phone === selected ? 'border-teal-600 bg-teal-50' : 'border-transparent hover:bg-slate-50'}`}>
          <span className="flex items-center justify-between gap-2"><strong className="truncate">{c.name || local(c.chat_phone)}</strong><small className="shrink-0 text-slate-500">{fmt(c.last_inbound_at)}</small></span>
          <span className="block truncate text-slate-600"><bdi>{clean(c.last_preview)}</bdi></span>
          <span className="mt-1 flex flex-wrap gap-1">
            {c.needs_staff && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">דורש צוות</span>}
            {isPaused(c) && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">בוט מושהה</span>}
          </span>
        </Link>)}
      </nav>
      <section className="card space-y-4" aria-label="שיחה">
        {!chat ? <p className="text-sm text-slate-600">בחרו שיחה מהרשימה.</p> : <>
          <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
            <div>
              <h2 className="text-xl font-bold">{chat.name || local(chat.chat_phone)}</h2>
              <p className="text-sm text-slate-600"><span dir="ltr">{local(chat.chat_phone)}</span>{chat.language && ` · ${chat.language === 'ar' ? 'ערבית' : 'עברית'}`}</p>
              {chat.needs_staff && <p className="mt-1 text-sm font-semibold text-red-800">דורש צוות: {reasonLabel(chat.staff_reason)} {chat.staff_flagged_at && `(${fmt(chat.staff_flagged_at)})`}</p>}
              {isPaused(chat) && <p className="mt-1 text-sm text-amber-900">הבוט מושהה בשיחה זו עד {fmt(chat.paused_until)} ({chat.paused_reason === 'staff_takeover' ? 'צוות כתב בשיחה' : 'השהיה ידנית'})</p>}
              {chat.handled_at && !chat.needs_staff && <p className="mt-1 text-sm text-slate-600">טופל ב־{fmt(chat.handled_at)}</p>}
            </div>
            <WhatsAppInboxActions chatPhone={chat.chat_phone} paused={isPaused(chat)} needsStaff={!!chat.needs_staff} />
          </header>
          {messages?.error ? <p role="alert" className="text-red-700">לא ניתן לטעון את ההודעות.</p> :
          <ol className="space-y-3">
            {messages?.data?.map((m) => {
              const shadow = m.direction === 'bot' && m.status === 'shadow';
              const mine = m.direction !== 'inbound';
              const label = m.direction === 'inbound' ? 'המשפחה' : m.direction === 'staff' ? 'צוות (נכתב בטלפון)' : shadow ? 'טיוטת בוט — לא נשלחה (מצב צל)' : `בוט · ${({ sent: 'נשלח', sending: 'בשליחה', failed: 'שליחה נכשלה', uncertain: 'שליחה לא ודאית' } as Record<string, string>)[m.status] ?? m.status}`;
              const skip = (m.meta as any)?.skip as string | undefined;
              return <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl border p-3 text-sm ${shadow ? 'border-dashed border-amber-500 bg-amber-50' : m.direction === 'inbound' ? 'border-slate-200 bg-white' : m.direction === 'staff' ? 'border-sky-200 bg-sky-50' : 'border-teal-200 bg-teal-50'}`}>
                  <p className="mb-1 text-xs font-semibold text-slate-600">{label} · {fmt(m.created_at)}{m.type !== 'chat' && ` · ${m.type}`}</p>
                  <p className="whitespace-pre-wrap break-words"><bdi>{clean(m.body) || `[${m.type}]`}</bdi></p>
                  {m.direction === 'inbound' && skip && <p className="mt-1 text-xs text-slate-500">ללא מענה אוטומטי: {({ paused: 'הבוט מושהה', needs_staff: 'ממתין לצוות', ai_failed: 'הבוט לא הצליח לנסח', chat_cap: 'מכסת שיחה', global_cap: 'מכסה כללית' } as Record<string, string>)[skip] ?? skip}</p>}
                </div>
              </li>;
            })}
          </ol>}
        </>}
      </section>
    </div>}
  </div>;
}
