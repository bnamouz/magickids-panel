import Link from 'next/link';
import type { caseDirectory } from '@/lib/intake/directory';
import { INTAKE_STAGES } from '@/lib/intake/progress';

export default function CaseDirectory({ result }: { result: ReturnType<typeof caseDirectory> | null }) {
  const url = (page: number) => `/admin/dashboard?${new URLSearchParams({ q: result?.query ?? '', page: String(page) })}#case-directory`;
  return <section id="case-directory" aria-labelledby="case-directory-title" className="card mb-6 scroll-mt-6">
    <h2 id="case-directory-title" className="text-xl font-bold text-[#01696f]">כל התיקים ותשובות השאלונים</h2>
    <p className="text-sm text-slate-600 mt-2">כולל תיקים שכבר הופק בהם דוח ותיקים שהסתיימו. ממוינים לפי הגשת השאלון האחרונה; תיק ללא הגשה לפי תאריך פתיחתו.</p>
    <form action="/admin/dashboard#case-directory" method="get" className="flex flex-wrap items-end gap-3 my-4">
      <label className="flex-1 min-w-0 basis-52" htmlFor="case-search">
        <span className="block text-sm font-semibold mb-1">חיפוש בכל התיקים לפי שם ילד או הורה</span>
        <input id="case-search" name="q" defaultValue={result?.query ?? ''} maxLength={120}
          placeholder="הקלידו שם ילד או הורה" className="w-full border border-slate-300 rounded-lg p-3 bg-white" />
      </label>
      <button type="submit" className="btn-primary min-h-11">חיפוש</button>
      {result?.query && <Link href="/admin/dashboard#case-directory" className="btn-ghost min-h-11">ניקוי חיפוש</Link>}
    </form>
    {!result ? <p role="alert" className="text-red-700">לא ניתן לטעון את התיקים כרגע. נסו לרענן; אין להסיק שהרשימה ריקה.</p> : <>
      <p role="status" className="text-sm text-slate-500 mb-3">{result.total} תיקים{result.query ? ' התואמים לחיפוש' : ' בכל הסטטוסים'}</p>
      {result.rows.length === 0 ? <p className="py-4 text-slate-600">לא נמצאו תיקים. נסו שם פרטי או חלק משם המשפחה.</p> :
        <ul className="divide-y divide-slate-100">{result.rows.map(row => <li key={row.id} className="py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 break-words">
            <Link href={`/admin/sessions/${row.id}`} className="font-bold text-[#01696f] underline">{row.childName}</Link>
            <p className="text-sm text-slate-600">הורה: {row.parentName}</p>
            <p className="text-xs text-slate-500 mt-1">
              {row.status === 'reported' ? 'הופק דוח' : row.status === 'cancelled' ? 'בוטל' : INTAKE_STAGES[row.stage]}
            </p>
            <p className="text-sm mt-2">שאלון הורים: {row.parentComplete ? 'הושלם ונשלח' : 'טרם הושלם ונשלח'}{row.parentSubmittedAt && <> · <time dateTime={row.parentSubmittedAt}>{dateLabel(row.parentSubmittedAt)}</time></>}</p>
            <p className="text-sm text-slate-600">שאלון מורה: {row.teacherComplete ? 'הושלם ונשלח' : 'טרם הושלם ונשלח'}{row.teacherSubmittedAt && <> · <time dateTime={row.teacherSubmittedAt}>{dateLabel(row.teacherSubmittedAt)}</time></>}</p>
          </div>
          <Link href={`/admin/sessions/${row.id}#questionnaires`} className="btn-ghost text-sm min-h-11">צפייה בתשובות השאלונים</Link>
        </li>)}</ul>}
      {result.pageCount > 1 && <nav aria-label="עמודי רשימת התיקים" className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
        {result.page > 1 ? <Link href={url(result.page - 1)} className="btn-ghost min-h-11">הקודם</Link> : <span />}
        <span className="text-sm text-slate-600">עמוד {result.page} מתוך {result.pageCount}</span>
        {result.page < result.pageCount ? <Link href={url(result.page + 1)} className="btn-ghost min-h-11">הבא</Link> : <span />}
      </nav>}
    </>}
  </section>;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('he-IL-u-nu-latn', {
    timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(value));
}
