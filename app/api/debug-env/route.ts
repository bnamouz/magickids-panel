import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// TEMPORARY DEBUG ENDPOINT — REMOVE AFTER USE
export async function GET(req: Request) {
  const url_ = new URL(req.url);
  const key = url_.searchParams.get('key');
  if (key !== 'debug-mki-2026') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '(unset)';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '(unset)';
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '(unset)';

  // Try to query reports
  let dbCount: any = null;
  let dbError: any = null;
  let sessionCount: any = null;
  let sampleReport: any = null;
  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase.from('reports').select('*', { count: 'exact', head: true });
    dbCount = count;
    dbError = error?.message;

    // Test 1: filter by session_id string
    const targetSession = '2cab02c2-4afb-4d05-8fdd-8a2be506a826';
    const { data: rows1, error: e1 } = await supabase
      .from('reports')
      .select('id, session_id')
      .eq('session_id', targetSession);
    // Test 2: no filter
    const { data: rows2 } = await supabase
      .from('reports')
      .select('session_id');
    // Test 3: filter using ilike
    const { data: rows3 } = await supabase
      .from('reports')
      .select('id')
      .filter('session_id', 'eq', targetSession);
    sessionCount = {
      by_eq_string: rows1?.length ?? 0,
      no_filter: rows2?.length ?? 0,
      by_filter: rows3?.length ?? 0,
      unique_sessions_seen: [...new Set(rows2?.map((r:any)=>r.session_id))],
      first_row_session_id_type: rows2?.[0] ? typeof rows2[0].session_id : 'none',
      first_row_session_id: rows2?.[0]?.session_id,
      target_matches_first: rows2?.[0]?.session_id === targetSession,
    };
    sampleReport = rows1;
    if (e1) dbError = (dbError ? dbError + ' | ' : '') + e1.message;
  } catch (e: any) {
    dbError = e.message;
  }

  return NextResponse.json({
    NEXT_PUBLIC_SUPABASE_URL: url,
    anon_key_prefix: anonKey.slice(0, 30),
    svc_key_prefix: svcKey.slice(0, 30),
    svc_key_ref: extractJwtRef(svcKey),
    anon_key_ref: extractJwtRef(anonKey),
    db_reports_total: dbCount,
    db_reports_for_session: sessionCount,
    sample_report: sampleReport,
    db_error: dbError,
  });
}

function extractJwtRef(jwt: string): string {
  try {
    const parts = jwt.split('.');
    if (parts.length < 2) return '(not-jwt)';
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload.ref || '(no-ref)';
  } catch {
    return '(decode-error)';
  }
}
