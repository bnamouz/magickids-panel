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

    // Isolate: which field is causing the empty result?
    async function q(fields: string) {
      const { data, error } = await supabase
        .from('reports')
        .select(fields)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });
      return { count: data?.length ?? 0, err: error?.message ?? null };
    }
    const qStatus = await q('id, status');
    const qAiModel = await q('id, ai_model');
    const qGeneratedAt = await q('id, generated_at');
    const qPdfPath = await q('id, pdf_storage_path');
    const qDownloadExpires = await q('id, download_expires_at');
    const qCreatedAt = await q('id, created_at');
    const qFull = await q('id, status, ai_model, generated_at, created_at, pdf_storage_path, download_expires_at');

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
        by_field: {
          status: qStatus,
          ai_model: qAiModel,
          generated_at: qGeneratedAt,
          pdf_storage_path: qPdfPath,
          download_expires_at: qDownloadExpires,
          created_at: qCreatedAt,
          full: qFull,
        },
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
