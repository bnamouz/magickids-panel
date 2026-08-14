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

    const { data: rows, error: e2 } = await supabase
      .from('reports')
      .select('id, session_id, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    sessionCount = rows?.length ?? 0;
    sampleReport = rows ?? null;
    if (e2) dbError = (dbError ? dbError + ' | ' : '') + e2.message;
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
