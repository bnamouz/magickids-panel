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

    // Workaround: Supabase JS client has an intermittent bug where
    // .select().eq().order() returns [] on tables with certain RLS policies
    // even with service role. Query all rows and filter in JS instead.
    // See internal debug notes 2026-08-15 for context.
    const { data: allData, error } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const filtered = (allData || []).filter((r: any) => r.session_id === sessionId);

    const reports = filtered.map((r: any) => ({
      id: r.id,
      status: r.status,
      ai_model: r.ai_model,
      generated_at: r.generated_at,
      created_at: r.created_at,
      pdf_storage_path: r.pdf_storage_path,
    }));

    return NextResponse.json({
      ok: true,
      reports,
      _debug: { total_in_db: allData?.length ?? 0, matched: filtered.length },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
