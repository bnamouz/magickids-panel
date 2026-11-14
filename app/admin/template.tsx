'use client';
import { usePathname } from 'next/navigation';
/** Re-mounts on every navigation, so each page plays one short entrance. */
export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  const home = usePathname() === '/admin/dashboard';
  return <div className={home ? 'mk-enter mk-enter-home' : 'mk-enter'} data-mk-enter="">{children}</div>;
}
