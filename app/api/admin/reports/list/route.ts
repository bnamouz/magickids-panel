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

    // Use select('*') then project fields in JS — Supabase JS client has a bug
    // where certain field combinations with .eq()+.order() return empty results
    // silently. See internal debug notes 2026-08-14.
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const reports = (data || []).map((r: any) => ({
      id: r.id,
      status: r.status,
      ai_model: r.ai_model,
      generated_at: r.generated_at,
      created_at: r.created_at,
      pdf_storage_path: r.pdf_storage_path,
    }));

    return NextResponse.json({ ok: true, reports });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
