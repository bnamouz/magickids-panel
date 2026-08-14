import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * TEMPORARY diagnostic endpoint. Remove after debugging.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('session_id') || '3e333347-11c0-4bab-923a-e7fba4f1b681';

  const supabase = getSupabaseAdmin();

  // Diag 1: env presence
  const envInfo = {
    supabase_url_len: (process.env.NEXT_PUBLIC_SUPABASE_URL || '').length,
    service_key_len: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').length,
    anon_key_len: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').length,
  };

  // Diag 2: eq query
  const eqResult = await supabase
    .from('reports')
    .select('id, session_id, status, created_at')
    .eq('session_id', sessionId);

  // Diag 3: no filter
  const allResult = await supabase
    .from('reports')
    .select('id, session_id, status, created_at')
    .limit(10);

  // Diag 4: raw session_id as filter param
  const filterInfo = {
    session_id: sessionId,
    session_id_len: sessionId.length,
    session_id_trimmed: sessionId.trim(),
  };

  return NextResponse.json({
    envInfo,
    filterInfo,
    eqResult: {
      data: eqResult.data,
      error: eqResult.error?.message,
      count: eqResult.data?.length,
    },
    allResult: {
      data: allResult.data,
      error: allResult.error?.message,
      count: allResult.data?.length,
    },
  });
}
