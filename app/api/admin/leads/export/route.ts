import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStaff, isAdmin } from '@/lib/admin/auth';
import { fetchLeads, stage, SOURCE_HE, normalizePhone } from '@/lib/analytics/leads';
import { getSupabaseAdmin } from '@/lib/supabase';
export const dynamic = 'force-dynamic';
const cell = (v: unknown) => { const s = String(v ?? '').replace(/"/g, '""'); return /^[=+\-@]/.test(s) ? `"'${s}"` : `"${s}"`; };
export async function GET(req: NextRequest) {
  const staff = await getCurrentStaff();
  if (!staff || !isAdmin(staff)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const p = req.nextUrl.searchParams;
  const { rows } = await fetchLeads({ q: p.get('q') || undefined, source: p.get('source') || undefined, days: Number(p.get('days')) || undefined, stage: p.get('stage') || undefined }, 5000);
  await getSupabaseAdmin().from('audit_log').insert({ actor_id: staff.id, actor_type: 'user', action: 'leads_export', entity_type: 'leads_feed', entity_id: null, metadata: { rows: rows.length, filters: Object.fromEntries(p) } }).then(() => null, () => null);
  const head = ['מקור', 'שם הילד/ה', 'הורה / פונה', 'טלפון', 'שפה', 'שלב', 'סטטוס במערכת', 'פרטים', 'תאריך'];
  const lines = rows.map(l => [SOURCE_HE[l.source] ?? l.source, l.name, l.contact, normalizePhone(l.phone), l.lang, stage(l.source, l.status).he, l.status, l.detail, new Date(l.created_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })].map(cell).join(','));
  const csv = '\ufeff' + [head.map(cell).join(','), ...lines].join('\r\n');
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
}
