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
        session_id_char_codes: [...sessionId].slice(0, 5).map(c => c.charCodeAt(0)),
        row_count: reports?.length ?? 0,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
