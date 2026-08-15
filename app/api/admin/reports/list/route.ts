import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * List reports for a session.
 *
 * Uses PostgREST REST API directly (with fetch cache: 'no-store') because the
 * Supabase JS client / PostgREST intermittently returned stale or missing rows
 * for recently-inserted reports — both .eq() and .select('*') exhibited the
 * problem. Bypassing the SDK and hitting REST with an explicit filter on
 * session_id is the most reliable path.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json({ error: 'נדרש session_id' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'server misconfigured' }, { status: 500 });
    }

    const restUrl =
      `${supabaseUrl}/rest/v1/reports` +
      `?session_id=eq.${encodeURIComponent(sessionId)}` +
      `&select=id,status,ai_model,generated_at,created_at,pdf_storage_path` +
      `&order=created_at.desc`;

    const res = await fetch(restUrl, {
      method: 'GET',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/json',
        Prefer: 'count=exact',
        // Ask PostgREST for fresh data — no PG plan cache reuse
        'Cache-Control': 'no-cache',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `PostgREST ${res.status}: ${text}` },
        { status: 500 },
      );
    }

    const reports = (await res.json()) as any[];

    return NextResponse.json(
      {
        ok: true,
        reports,
        _debug: { matched: reports.length, source: 'rest-direct' },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
