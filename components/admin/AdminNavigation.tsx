'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BarChart3, CalendarDays, ChevronDown, LayoutDashboard, Menu, MessageSquare, Settings2, Users, X } from 'lucide-react';
import { DASHBOARD_HREF, DASHBOARD_LABEL, NAV_FOLDERS, isActivePath, locatePath } from './nav-config';
const ICONS = { calendar: CalendarDays, patients: Users, communication: MessageSquare, marketing: BarChart3, management: Settings2 } as const;
const STORE = 'mk-nav-folder';
export default function AdminNavigation({ footer }: { footer?: React.ReactNode }) {
  const pathname = usePathname();
  const activeFolder = locatePath(pathname)?.folder.id ?? null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFolder, setOpenFolder] = useState<string | null>(activeFolder);
  // Follow the current page; on pages outside every folder, restore the folder last used.
  useEffect(() => {
    if (activeFolder) { setOpenFolder(activeFolder); return; }
    try { const saved = window.localStorage.getItem(STORE); if (saved && NAV_FOLDERS.some(f => f.id === saved)) setOpenFolder(saved); } catch {}
  }, [activeFolder]);
  function toggle(id: string) {
    setOpenFolder(current => {
      const next = current === id ? null : id;
      try { if (next) window.localStorage.setItem(STORE, next); else window.localStorage.removeItem(STORE); } catch {}
      return next;
    });
  }
  const onDashboard = pathname === DASHBOARD_HREF;
  return <aside className="mk-sidebar">
    <div className="mk-sidebar-head">
      <Link href={DASHBOARD_HREF} className="mk-brand" onClick={() => setMenuOpen(false)}><strong>ילדי הקסם</strong><span>סביבת העבודה לצוות</span></Link>
      <button type="button" aria-expanded={menuOpen} aria-controls="staff-navigation" onClick={() => setMenuOpen(v => !v)} className="mk-menu-button">תפריט הצוות{menuOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}</button>
    </div>
    <nav id="staff-navigation" aria-label="ניווט צוות לפי תיקייה" className="mk-nav" data-open={menuOpen ? 'true' : 'false'}>
      <Link href={DASHBOARD_HREF} aria-current={onDashboard ? 'page' : undefined} onClick={() => setMenuOpen(false)} className="mk-nav-home"><LayoutDashboard size={17} aria-hidden="true" />{DASHBOARD_LABEL}</Link>
      <p className="mk-nav-caption">תיקיות</p>
      {NAV_FOLDERS.map(({ id, title, items }) => {
        const Icon = ICONS[id as keyof typeof ICONS], open = openFolder === id;
        return <section key={id} className="mk-folder" data-active={activeFolder === id ? 'true' : undefined}>
          <button type="button" aria-expanded={open} aria-controls={`staff-folder-${id}`} onClick={() => toggle(id)} className="mk-folder-button">
            <Icon size={17} aria-hidden="true" /><span>{title}</span><span className="mk-folder-count" aria-hidden="true">{items.length}</span><ChevronDown size={15} aria-hidden="true" className="mk-folder-chevron" />
          </button>
          <div id={`staff-folder-${id}`} hidden={!open} className="mk-folder-items">
            {items.map(([href, label]) => <Link key={href} href={href} aria-current={isActivePath(pathname, href) ? 'page' : undefined} onClick={() => setMenuOpen(false)} className="mk-nav-link">{label}</Link>)}
          </div>
        </section>;
      })}
    </nav>
    {footer && <div className="mk-sidebar-foot">{footer}</div>}
  </aside>;
}
