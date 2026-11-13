'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import CaseActions from '@/components/admin/CaseActions';
import FollowUpButton from '@/components/admin/FollowUpButton';
export type WorkKind = 'call' | 'request' | 'case';
export type WorkItem = {
  key: string; kind: WorkKind; kindLabel: string; title: string; titleHref?: string;
  badge: string; tone: 'warn' | 'info' | 'ok'; meta: string; href: string; action: string;
  callId?: string; linkedCaseId?: string | null; caseId?: string;
};
type Tab = 'all' | WorkKind;
const TABS: { id: Tab; label: string }[] = [{ id: 'all', label: 'הכול' }, { id: 'call', label: 'שיחות' }, { id: 'request', label: 'פניות' }, { id: 'case', label: 'תיקים' }];
const EMPTY: Record<Tab, string> = {
  all: 'אין כרגע פריטים שממתינים לטיפול',
  call: 'אין שיחות שממתינות לטיפול',
  request: 'אין פניות שממתינות לתיאום',
  case: 'אין תיקים שממתינים לזימון או להמשך טיפול',
};
const PAGE = 8;
/**
 * One prioritised list of everything staff must act on.
 * `counts` are the true totals per source; `failed` marks sources that did not load,
 * so an empty list is never presented as "nothing to do" when data is missing.
 */
export default function WorkQueue({ items, counts, failed, errors, notes, canDelete }: {
  items: WorkItem[]; counts: Record<WorkKind, number>; failed: Record<WorkKind, boolean>;
  errors: string[]; notes: string[]; canDelete: boolean;
}) {
  const [tab, setTab] = useState<Tab>('all'), [query, setQuery] = useState(''), [expanded, setExpanded] = useState(false), [openKey, setOpenKey] = useState<string | null>(null);
  const anyFailed = failed.call || failed.request || failed.case;
  const total = counts.call + counts.request + counts.case;
  // A source that failed to load has an unknown count: show a lower bound, or a dash when nothing is known.
  const known = (id: Tab) => { const value = id === 'all' ? total : counts[id], partial = id === 'all' ? anyFailed : failed[id]; return !partial ? String(value) : value ? `${value}+` : '—'; };
  const needle = query.trim().toLocaleLowerCase('he');
  const matching = useMemo(() => items.filter(item => (tab === 'all' || item.kind === tab)
    && (!needle || [item.title, item.meta, item.badge, item.kindLabel].join(' ').toLocaleLowerCase('he').includes(needle))), [items, tab, needle]);
  const limited = tab === 'all' && !needle && !expanded && matching.length > PAGE;
  const shown = limited ? matching.slice(0, PAGE) : matching;
  const tabFailed = tab === 'all' ? anyFailed : failed[tab];
  const priorityKey = items[0]?.key;
  return <section className="mk-panel mk-work" aria-labelledby="work-title" data-region="work-queue">
    <div className="mk-panel-head">
      <div className="mk-work-title"><h2 id="work-title">דורש טיפול</h2><span className="mk-count">{known('all')}</span>{anyFailed && <span className="mk-badge" data-tone="warn">נתונים חלקיים</span>}</div>
      <p>שיחות, פניות לטיפול ותיקי קשב שממתינים לפעולה של הצוות, לפי סדר דחיפות.</p>
    </div>
    <div className="mk-toolbar">
      <div className="mk-tabs" role="group" aria-label="סינון לפי סוג">
        {TABS.map(({ id, label }) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => { setTab(id); setOpenKey(null); }} className="mk-tab">{label}<small>{known(id)}</small></button>)}
      </div>
      <input type="search" value={query} onChange={e => setQuery(e.target.value)} maxLength={80} placeholder="סינון לפי שם" aria-label="סינון הרשימה לפי שם" className="mk-filter" />
    </div>
    <p className="sr-only" role="status">{shown.length} פריטים מוצגים</p>
    {errors.length > 0 && <div style={{ paddingTop: 12 }}>{errors.map(text => <p key={text} role="alert" className="mk-alert">{text}</p>)}</div>}
    {shown.length === 0 ? (needle
      ? <div className="mk-empty"><strong>לא נמצאו פריטים תואמים</strong>נסו שם אחר או נקו את הסינון.<br /><button type="button" onClick={() => setQuery('')} className="mk-action">ניקוי הסינון</button></div>
      : tabFailed ? <div className="mk-empty">הנתונים לא נטענו במלואם, ולכן אי אפשר לדעת אם יש פריטים לטיפול.</div>
      : <div className="mk-empty"><strong>{EMPTY[tab]}</strong>פריטים חדשים יופיעו כאן לאחר רענון הנתונים.</div>)
      : <ul className="mk-work-list">{shown.map(item => {
        const priority = item.key === priorityKey, more = openKey === item.key;
        return <li key={item.key} className="mk-item" data-priority={priority ? 'true' : undefined} data-kind={item.kind}>
          <div>
            <div className="mk-item-top">
              <h3>{item.titleHref ? <Link href={item.titleHref} className="mk-title-link">{item.title}</Link> : item.title}</h3>
              <span className="mk-badge" data-tone={item.tone}>{item.badge}</span>
              <span className="mk-kind">{item.kindLabel}</span>
            </div>
            {item.meta && <p className="mk-item-meta">{item.meta}</p>}
          </div>
          <div className="mk-item-actions">
            {item.linkedCaseId && <Link href={`/admin/sessions/${item.linkedCaseId}#calls`} className="mk-action mk-action-quiet" aria-label={`התיק של ${item.title}`}>תיק</Link>}
            <Link href={item.href} className="mk-action mk-action-main" aria-label={`${item.action}: ${item.title}`}>{item.action}</Link>
            {item.callId && <FollowUpButton callId={item.callId} />}
            {item.caseId && <button type="button" aria-expanded={more} aria-controls={`more-${item.key}`} onClick={() => setOpenKey(more ? null : item.key)} className="mk-action mk-action-quiet" aria-label={`פעולות נוספות: ${item.title}`}>{more ? 'סגירה' : 'עוד'}</button>}
          </div>
          {item.caseId && more && <div id={`more-${item.key}`} className="mk-item-more"><CaseActions id={item.caseId} name={item.title} canDelete={canDelete} /></div>}
        </li>;
      })}</ul>}
    {limited && <div className="mk-work-more"><button type="button" onClick={() => setExpanded(true)} className="mk-action">הצגת כל {matching.length} הפריטים</button></div>}
    <div className="mk-panel-foot">
      <span>לרשימות המלאות:</span>
      <Link href="/admin/calls">שיחות</Link>
      <Link href="/admin/treatments">פניות לטיפול</Link>
      <Link href="/admin/intake?stage=ready">מוכנים לזימון</Link>
      <Link href="/admin/sessions?filter=stuck">תיקים להמשך טיפול</Link>
      <Link href="/admin/treatments?status=closed">פניות שנסגרו</Link>
      {notes.length > 0 && <p className="mk-foot-notes">{notes.join(' ')}</p>}
    </div>
  </section>;
}
