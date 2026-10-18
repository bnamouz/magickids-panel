'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { track } from '@/lib/analytics/client';
const PRIVATE = ['/admin', '/therapist', '/auth', '/api', '/onboarding/status'];
/** Records page views on public pages only; staff and therapist areas are never tracked. */
export default function SiteTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || PRIVATE.some(p => pathname === p || pathname.startsWith(p + '/'))) return;
    track('view', null, pathname);
  }, [pathname]);
  return null;
}
