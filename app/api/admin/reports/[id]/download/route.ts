import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reportId = params.id;
    if (!reportId) {
      return NextResponse.json({ error: 'report_id חובה' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'server misconfigured' }, { status: 500 });
    }

    // Load report via REST directly (bypasses SDK caching that has caused
    // stale rows for recently updated records).
    const restUrl =
      `${supabaseUrl}/rest/v1/reports` +
      `?id=eq.${encodeURIComponent(reportId)}` +
      `&select=id,session_id,pdf_storage_path,download_url,download_expires_at,status`;

    const res = await fetch(restUrl, {
      method: 'GET',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `PostgREST ${res.status}: ${text}` },
        { status: 500 }
      );
    }

    const rows = (await res.json()) as any[];
    const report = rows && rows.length > 0 ? rows[0] : null;

    if (!report) {
      return NextResponse.json({ error: 'דוח לא נמצא' }, { status: 404 });
    }

    if (!report.pdf_storage_path) {
      return NextResponse.json({ error: 'לא נמצא PDF לדוח זה' }, { status: 404 });
    }

    // Check if existing signed URL is still valid
    const now = new Date();
    const expiresAt = report.download_expires_at
      ? new Date(report.download_expires_at)
      : null;

    let signedUrl = report.download_url;
    // Regenerate if expired or missing (with 5 min buffer)
    if (!signedUrl || !expiresAt || expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      const supabase = getSupabaseAdmin();
      const { data: signedData, error: signErr } = await supabase.storage
        .from('reports')
        .createSignedUrl(report.pdf_storage_path, 3600);

      if (signErr || !signedData?.signedUrl) {
        return NextResponse.json(
          { error: `שגיאה ביצירת קישור הורדה: ${signErr?.message || 'unknown'}` },
          { status: 500 }
        );
      }

      signedUrl = signedData.signedUrl;

      // Update DB
      await supabase
        .from('reports')
        .update({
          download_url: signedUrl,
          download_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        })
        .eq('id', reportId);
    }

    // Redirect to signed URL for direct download
    const url = new URL(req.url);
    const inline = url.searchParams.get('inline') === '1';

    if (inline) {
      return NextResponse.json({ ok: true, url: signedUrl });
    }

    return NextResponse.redirect(signedUrl);
  } catch (e: any) {
    console.error('Report download error:', e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
