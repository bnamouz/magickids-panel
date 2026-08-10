import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Try cookie-based session first
    const supabase = getSupabaseServerClient();
    let {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    // Fallback: try Authorization: Bearer <token>
    if (!user) {
      const authHeader = req.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const tokenClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );
        const { data: tokenData, error: tokenErr } = await tokenClient.auth.getUser(token);
        if (tokenErr) {
          console.error('[verify] bearer auth error:', tokenErr.message);
        } else if (tokenData.user) {
          user = tokenData.user;
        }
      }
    }

    if (authError) {
      console.error('[verify] auth error:', authError.message);
      return NextResponse.json(
        { ok: false, reason: 'auth_error', detail: authError.message },
        { status: 401 },
      );
    }

    if (!user) {
      console.error('[verify] no user in session');
      return NextResponse.json(
        { ok: false, reason: 'no_session' },
        { status: 401 },
      );
    }

    if (!user.email) {
      console.error('[verify] user has no email:', user.id);
      return NextResponse.json(
        { ok: false, reason: 'no_email', user_id: user.id },
        { status: 401 },
      );
    }

    console.log('[verify] looking up staff for email:', user.email);

    const admin = getSupabaseAdmin();
    const { data: staff, error: staffError } = await admin
      .from('staff_users')
      .select('id, email, full_name, role, is_active')
      .ilike('email', user.email)
      .maybeSingle();

    if (staffError) {
      console.error('[verify] staff lookup error:', staffError.message);
      return NextResponse.json(
        { ok: false, reason: 'db_error', detail: staffError.message },
        { status: 500 },
      );
    }

    if (!staff) {
      console.error('[verify] no staff row for email:', user.email);
      return NextResponse.json(
        { ok: false, reason: 'not_staff', email: user.email },
        { status: 403 },
      );
    }

    if (!staff.is_active) {
      console.error('[verify] staff not active:', user.email);
      return NextResponse.json(
        { ok: false, reason: 'not_active', email: user.email },
        { status: 403 },
      );
    }

    console.log('[verify] success:', staff.email, staff.role);
    return NextResponse.json({
      ok: true,
      staff: {
        id: staff.id,
        email: staff.email,
        name: staff.full_name,
        role: staff.role,
      },
    });
  } catch (err: any) {
    console.error('[verify] unexpected error:', err?.message ?? err);
    return NextResponse.json(
      { ok: false, reason: 'exception', detail: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
