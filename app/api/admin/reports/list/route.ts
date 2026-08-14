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
    // Try progressively adding fields to find the breaking point
    const q2f = await q('id, status');
    const q3f = await q('id, status, ai_model');
    const q4f = await q('id, status, ai_model, generated_at');
    const q5f = await q('id, status, ai_model, generated_at, created_at');
    const q6f = await q('id, status, ai_model, generated_at, created_at, pdf_storage_path');
    const q7f = await q('id, status, ai_model, generated_at, created_at, pdf_storage_path, download_expires_at');
    // Try * to see if select all works
    const qStar = await q('*');

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
        progressive: { q2f, q3f, q4f, q5f, q6f, q7f, star: qStar },
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
