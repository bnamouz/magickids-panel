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

    // Progressive debug: which field is breaking?
    async function q(fields: string) {
      const { data, error } = await supabase
        .from('reports')
        .select(fields)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });
      return { count: data?.length ?? 0, err: error?.message ?? null };
    }

    const q_id = await q('id');
    const q_status = await q('id, status');
    const q_ai = await q('id, status, ai_model');
    const q_gen = await q('id, status, ai_model, generated_at');
    const q_cr = await q('id, status, ai_model, generated_at, created_at');
    const q_pdf = await q('id, status, ai_model, generated_at, created_at, pdf_storage_path');
    const q_star = await q('*');

    // Actual query as returned to client
    const { data: reports, error } = await supabase
      .from('reports')
      .select('id, status, ai_model, generated_at, created_at, pdf_storage_path')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      reports: reports || [],
      debug: {
        session_id: sessionId,
        q_id,
        q_status,
        q_ai,
        q_gen,
        q_cr,
        q_pdf,
        q_star,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
