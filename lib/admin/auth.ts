/**
 * Admin authentication helpers.
 * Uses Supabase Auth (email + password) for clinic staff.
 * Verifies the user exists in `staff_users` table AND is_active = true.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '../supabase';

export type StaffUser = {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'diagnostician' | 'assistant';
  is_active: boolean;
};

/**
 * Get a Supabase client bound to the current admin session cookie.
 * Use this in Server Components and Route Handlers.
 */
export function getSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server Component — set will fail silently; middleware handles refresh.
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {}
        },
      },
    },
  );
}

/**
 * Returns the logged-in staff user, or null.
 * Verifies:
 *   1. Auth session exists.
 *   2. Email matches a row in `staff_users`.
 *   3. `is_active = true`.
 */
export async function getCurrentStaff(): Promise<StaffUser | null> {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const admin = getSupabaseAdmin();
  const { data: staff } = await admin
    .from('staff_users')
    .select('id, email, full_name, role, is_active')
    .ilike('email', user.email)
    .maybeSingle();

  if (!staff || !staff.is_active) return null;
  return staff as StaffUser;
}

/** Require staff or throw. Used at page-level. */
export async function requireStaff(): Promise<StaffUser> {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error('UNAUTHORIZED');
  return staff;
}

/** Role check helpers. */
export function isAdmin(staff: StaffUser | null): boolean {
  return staff?.role === 'admin';
}
export function canEditReports(staff: StaffUser | null): boolean {
  return staff?.role === 'admin' || staff?.role === 'diagnostician';
}
