'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DASHBOARD_HREF, DASHBOARD_LABEL, locatePath } from './nav-config';
const STORE = 'mk-motion';
export default function AdminTopbar({ end }: { end?: React.ReactNode }) {
  const pathname = usePathname();
  const place = locatePath(pathname);
  const [reduced, setReduced] = useState(false), [system, setSystem] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORE) === 'reduced';
      setReduced(saved);
      // Client-side entry (for example right after login) skips the inline script in the layout.
      if (saved) { const shell = document.querySelector<HTMLElement>('.mk-admin'); if (shell) shell.dataset.motion = 'reduced'; }
    } catch {}
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setSystem(media.matches);
    sync(); media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  function toggle() {
    const next = !reduced; setReduced(next);
    try { if (next) window.localStorage.setItem(STORE, 'reduced'); else window.localStorage.removeItem(STORE); } catch {}
    const shell = document.querySelector<HTMLElement>('.mk-admin');
    if (shell) { if (next) shell.dataset.motion = 'reduced'; else delete shell.dataset.motion; }
  }
  return <div className="mk-topbar">
    <nav aria-label="מיקום במערכת" className="mk-crumb">
      <Link href={DASHBOARD_HREF}>ילדי הקסם</Link>
      {place ? <><span aria-hidden="true">/</span><span>{place.folder.title}</span><span aria-hidden="true">/</span><strong aria-current="page">{place.label}</strong></>
        : <><span aria-hidden="true">/</span><strong aria-current={pathname === DASHBOARD_HREF ? 'page' : undefined}>{pathname === DASHBOARD_HREF ? DASHBOARD_LABEL : 'סביבת הצוות'}</strong></>}
    </nav>
    <div className="mk-topbar-actions">
      <button type="button" onClick={toggle} disabled={system} aria-pressed={!(reduced || system)} title={system ? 'התנועה מופחתת לפי הגדרת המכשיר' : undefined} className="mk-motion-control">תנועה: {reduced || system ? 'מופחתת' : 'פעילה'}</button>
      <Link href="/admin/pediatrics-calendar" className="mk-topbar-link">יומן מרפאת הילדים</Link>
      {end}
    </div>
  </div>;
}
