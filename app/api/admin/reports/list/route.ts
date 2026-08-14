import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json({ error: 'session_id חובה' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Try TWO queries — same client — to isolate the bug
    const { data: reportsWithFilter } = await supabase
      .from('reports')
      .select('id, session_id')
      .eq('session_id', sessionId);

    const { data: allReports } = await supabase
      .from('reports')
      .select('id, session_id');

    const { data: reports, error } = await supabase
      .from('reports')
      .select(
        'id, status, ai_model, generated_at, created_at, pdf_storage_path, download_expires_at'
      )
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message, debug: { sessionId, len: sessionId.length } }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      reports: reports || [],
      debug: {
        received_session_id: sessionId,
        session_id_length: sessionId.length,
        row_count: reports?.length ?? 0,
        filter_count: reportsWithFilter?.length ?? 0,
        all_count: allReports?.length ?? 0,
        sessions_in_db: [...new Set((allReports || []).map((r: any) => r.session_id))],
        matching_manual: (allReports || []).filter((r: any) => r.session_id === sessionId).length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
