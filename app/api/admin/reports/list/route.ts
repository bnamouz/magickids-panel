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

    // Isolate: is it the .order() call that breaks things?
    const { data: q1 } = await supabase
      .from('reports')
      .select('id, session_id')
      .eq('session_id', sessionId);

    const { data: q2 } = await supabase
      .from('reports')
      .select('id, session_id, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    const { data: q3 } = await supabase
      .from('reports')
      .select('id, session_id, created_at')
      .order('created_at', { ascending: false });

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
        q1_filter_only: q1?.length ?? 0,
        q2_filter_and_order: q2?.length ?? 0,
        q3_order_only: q3?.length ?? 0,
        q4_full_select: reports?.length ?? 0,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
