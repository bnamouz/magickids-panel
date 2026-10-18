import Link from 'next/link';
import { usageSummary } from '@/lib/analytics/usage';
import { fetchLeads, groupByPhone, stage, SOURCE_HE, SOURCE_LINK } from '@/lib/analytics/leads';

const fmt = (iso: string) => new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const STAGES: [string, string][] = [['', 'כל השלבים'], ['new', 'חדש / ממתין לטיפול'], ['active', 'בתהליך'], ['paid', 'אושר / שולם'], ['booked', 'נקבע תור'], ['done', 'טופל'], ['lost', 'בוטל / נותק']];

function Bars({ title, rows, total }: { title: string; rows: [string, number][]; total?: number }) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return <div className="card"><h3 className="font-bold text-teal-800 mb-2">{title}</h3>
    {rows.length === 0 ? <p className="text-sm text-slate-500">אין נתונים עדיין.</p> : <ul className="space-y-1.5">{rows.map(([k, n]) => <li key={k} className="text-sm">
      <div className="flex justify-between gap-2"><span className="truncate">{k}</span><b className="tabular-nums">{n}{total ? <span className="text-slate-400 font-normal"> · {Math.round(n / total * 100)}%</span> : null}</b></div>
      <div className="h-1.5 bg-slate-100 rounded"><div className="h-1.5 bg-teal-500 rounded" style={{ width: `${Math.round(n / max * 100)}%` }} /></div></li>)}</ul>}
  </div>;
}

export async function Usage(range: number) {
  const u = await usageSummary(range);
  const maxDay = Math.max(1, ...u.byDay.map(d => d.views));
  return <>
    <div className="flex flex-wrap gap-2 items-center text-sm">טווח: {[7, 30, 90].map(d => <Link key={d} href={`/admin/leads?tab=usage&range=${d}`} className={`px-3 py-1 rounded-full border ${range === d ? 'bg-teal-700 text-white border-teal-700' : 'bg-white'}`}>{d} ימים</Link>)}
      <span className="text-slate-500 mr-2">המדידה החלה ב־18.10.2026, בלי עוגיות ובלי שירות חיצוני.</span></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[['מבקרים ייחודיים', u.visitors], ['ביקורים', u.sessions], ['צפיות בעמודים', u.views], ['לחיצות ופעולות', u.total - u.views]].map(([k, n]) => <div key={k as string} className="card text-center"><div className="text-3xl font-bold text-teal-800 tabular-nums">{n as number}</div><div className="text-sm text-slate-600">{k as string}</div></div>)}
    </div>
    <div className="card"><h3 className="font-bold text-teal-800 mb-2">צפיות לפי יום</h3>
      <div className="flex items-end gap-[2px] h-28" dir="ltr">{u.byDay.map(d => <div key={d.day} title={`${d.day}: ${d.views} צפיות, ${d.visitors} מבקרים`} className="flex-1 bg-teal-500/80 rounded-t min-w-[3px]" style={{ height: `${Math.max(2, Math.round(d.views / maxDay * 100))}%` }} />)}</div>
      <div className="flex justify-between text-xs text-slate-500 mt-1" dir="ltr"><span>{u.byDay[0]?.day}</span><span>{u.byDay[u.byDay.length - 1]?.day}</span></div></div>
    <div className="card"><h3 className="font-bold text-teal-800 mb-2">משפך: מביקור ועד תור</h3>
      <ol className="grid md:grid-cols-6 gap-2">{u.funnel.map((f, i) => <li key={f.he} className="rounded-xl bg-teal-50 p-3 text-center"><div className="text-2xl font-bold text-teal-800 tabular-nums">{f.n}</div><div className="text-xs text-slate-700">{f.he}</div>{i > 0 && u.funnel[0].n > 0 && <div className="text-xs text-slate-400">{Math.round(f.n / u.funnel[0].n * 100)}% מהמבקרים</div>}</li>)}</ol></div>
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
      <Bars title="עמודים נצפים" rows={u.pages} total={u.views} />
      <Bars title="מאיפה הגיעו (לפי ביקור)" rows={u.sources} total={u.sessions} />
      <Bars title="כפתורים שנלחצו" rows={u.clicks} />
      <Bars title="פעולות שהושלמו" rows={u.steps} />
      <Bars title="שפה" rows={u.langs} total={u.views} />
      <Bars title="מכשיר" rows={u.devices} total={u.views} />
      <Bars title="ערים" rows={u.cities} total={u.views} />
    </div>
  </>;
}

export async function Leads(f: { q?: string; source?: string; days?: number; stage?: string }, grouped: boolean) {
  const { rows, total } = await fetchLeads(f);
  const groups = grouped ? groupByPhone(rows) : null;
  const qs = new URLSearchParams(Object.entries({ q: f.q, source: f.source, days: f.days ? String(f.days) : '', stage: f.stage }).filter(([, v]) => v) as [string, string][]);
  const stageBadge = (s: ReturnType<typeof stage>) => <span className={`text-xs px-2 py-0.5 rounded-full ${s.key === 'booked' || s.key === 'done' ? 'bg-green-100 text-green-800' : s.key === 'paid' ? 'bg-blue-100 text-blue-800' : s.key === 'lost' ? 'bg-slate-200 text-slate-600' : s.key === 'active' ? 'bg-teal-50 text-teal-800' : 'bg-amber-100 text-amber-800'}`}>{s.he}</span>;
  const wa = (p: string) => p ? `https://wa.me/${p.startsWith('0') ? '972' + p.slice(1) : p}` : '';
  return <>
    <form className="card grid md:grid-cols-5 gap-2 items-end" method="get">
      <input type="hidden" name="tab" value="leads" /><input type="hidden" name="view" value={grouped ? 'grouped' : 'all'} />
      <label className="text-sm md:col-span-2">חיפוש לפי שם או טלפון<input name="q" defaultValue={f.q ?? ''} className="w-full border rounded-lg px-3 py-2 bg-white" placeholder="למשל 050 או שם הילד" /></label>
      <label className="text-sm">מקור<select name="source" defaultValue={f.source ?? ''} className="w-full border rounded-lg px-3 py-2 bg-white"><option value="">כל המקורות</option>{Object.entries(SOURCE_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="text-sm">שלב<select name="stage" defaultValue={f.stage ?? ''} className="w-full border rounded-lg px-3 py-2 bg-white">{STAGES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="text-sm">תקופה<select name="days" defaultValue={f.days ? String(f.days) : ''} className="w-full border rounded-lg px-3 py-2 bg-white"><option value="">הכול</option><option value="7">7 ימים</option><option value="30">30 יום</option><option value="90">90 יום</option><option value="365">שנה</option></select></label>
      <div className="md:col-span-5 flex flex-wrap gap-2 items-center"><button className="btn-primary !py-2 !px-5 text-sm" type="submit">סינון</button>
        <Link href={`/admin/leads?tab=leads&view=${grouped ? 'all' : 'grouped'}&${qs}`} className="btn-ghost !py-2 !px-4 text-sm">{grouped ? 'הצגת כל הפניות בנפרד' : 'איחוד לפי טלפון'}</Link>
        <a href={`/api/admin/leads/export?${qs}`} className="btn-ghost !py-2 !px-4 text-sm">ייצוא לאקסל (CSV)</a>
        <span className="text-sm text-slate-600 mr-auto">{grouped ? `${groups!.length} לידים (מאוחדים לפי טלפון) מתוך ${total} פניות` : `${rows.length} מתוך ${total} פניות`}{total > rows.length ? ' · מוצגות 400 האחרונות, צמצמו עם סינון' : ''}</span></div>
    </form>
    <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-slate-50 text-right"><tr>
      <th className="p-2">שם הילד/ה</th><th className="p-2">הורה / פונה</th><th className="p-2">טלפון</th><th className="p-2">{grouped ? 'ערוצים' : 'מקור'}</th><th className="p-2">שלב</th><th className="p-2">פרטים</th><th className="p-2">{grouped ? 'פנייה אחרונה' : 'תאריך'}</th></tr></thead>
      <tbody>{grouped ? groups!.map(g => <tr key={g.phone + g.first} className="border-t align-top">
        <td className="p-2 font-semibold">{g.name || '—'}</td><td className="p-2">{g.contact || '—'}</td>
        <td className="p-2 whitespace-nowrap" dir="ltr">{g.phone ? <a className="text-teal-700 underline" href={wa(g.phone)} target="_blank" rel="noreferrer">{g.phone}</a> : '—'}</td>
        <td className="p-2"><div className="flex flex-wrap gap-1">{Array.from(g.sources).map(s => <Link key={s} href={SOURCE_LINK[s] ?? '#'} className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-100">{SOURCE_HE[s] ?? s}</Link>)}{g.touches > 1 && <span className="text-xs text-slate-500">{g.touches} פניות</span>}</div></td>
        <td className="p-2">{stageBadge(stage(g.latest.source, g.latest.status))}</td><td className="p-2 text-slate-600 max-w-[16rem] truncate" title={g.latest.detail ?? ''}>{g.latest.detail ?? ''}</td><td className="p-2 whitespace-nowrap text-slate-600">{fmt(g.last)}</td></tr>)
        : rows.map(l => <tr key={l.source + l.id} className="border-t align-top">
        <td className="p-2 font-semibold">{l.name || '—'}</td><td className="p-2">{l.contact || '—'}</td>
        <td className="p-2 whitespace-nowrap" dir="ltr">{l.phone ? <a className="text-teal-700 underline" href={wa(l.phone)} target="_blank" rel="noreferrer">{l.phone}</a> : '—'}</td>
        <td className="p-2"><Link href={SOURCE_LINK[l.source] ?? '#'} className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-100">{SOURCE_HE[l.source] ?? l.source}</Link></td>
        <td className="p-2">{stageBadge(stage(l.source, l.status))}</td><td className="p-2 text-slate-600 max-w-[16rem] truncate" title={l.detail ?? ''}>{l.detail ?? ''}</td><td className="p-2 whitespace-nowrap text-slate-600">{fmt(l.created_at)}</td></tr>)}
      {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-500">לא נמצאו פניות לסינון הזה.</td></tr>}</tbody></table></div>
  </>;
}
