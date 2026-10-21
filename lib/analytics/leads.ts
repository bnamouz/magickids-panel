import { getSupabaseAdmin } from '@/lib/supabase';

export const SOURCE_HE: Record<string, string> = {
  intake: 'פתיחת תיק ושאלונים', adhd_payment: 'תשלום לאבחון קשב', moxo: 'בקשת MOXO', treatment: 'בקשת טיפול', rana: 'תור למטפל/ת',
  classes: 'חוגים', development: 'התפתחות הילד', abroad: 'ליווי בחו״ל', sarah: 'שיחה לשרה', nour: 'שיחה לנור',
};
export const SOURCE_LINK: Record<string, string> = {
  intake: '/admin/intake', adhd_payment: '/admin/adhd-payments', moxo: '/admin/moxo', treatment: '/admin/treatments', rana: '/admin/therapy',
  classes: '/admin/classes', development: '/admin/development', abroad: '/admin/abroad', sarah: '/admin/calls', nour: '/admin/personal/calls',
};
/** Collapses the many per-table statuses into a few stages that make sense on a leads board. */
const STATUS_HE: Record<string, string> = {
  created: 'תיק נפתח', parent_form_started: 'הורה התחיל שאלון', parent_form_done: 'שאלון הורה הושלם', teacher_link_sent: 'נשלח קישור למורה', reported: 'דוח הופק', booked: 'נקבע תור',
  pending: 'ממתין', uploading: 'ממתין לאישור תשלום', approved: 'אושר', rejected: 'נדחה', scheduled: 'נקבע תור', confirmed: 'תור אושר', cancelled: 'בוטל', expired: 'פג תוקף', closed: 'טופל ונסגר', contacted: 'נוצר קשר',
  new: 'חדש', parent: 'ממתין לשאלון הורה', education: 'ממתין לשאלון מסגרת', review: 'ממתין לסיכום רופא',
  dropped: 'שיחה נותקה', info_only: 'קיבל/ה מידע', callback_requested: 'ביקש/ה שיחה חוזרת', task_created: 'נוצרה משימה', meeting_booked: 'נקבעה פגישה', escalated: 'הועבר לצוות', intake_sent: 'נשלח קישור הרשמה', call: 'שיחה',
};
export function stage(source: string, status: string | null): { key: 'new' | 'active' | 'paid' | 'booked' | 'done' | 'lost'; he: string } {
  const s = (status ?? '').toLowerCase(); const he = STATUS_HE[s] ?? (status || 'חדש');
  if (['rejected', 'cancelled', 'canceled', 'expired', 'declined', 'dropped'].includes(s)) return { key: 'lost', he };
  if (['booked', 'scheduled', 'confirmed', 'meeting_booked'].includes(s)) return { key: 'booked', he };
  if (['approved', 'paid'].includes(s)) return { key: 'paid', he: source === 'adhd_payment' ? 'תשלום אושר' : he };
  if (['reported', 'closed', 'done', 'resolved', 'info_only', 'task_created'].includes(s)) return { key: 'done', he };
  if (['pending', 'new', 'uploading', 'created', 'call', 'callback_requested', 'escalated', 'intake_sent'].includes(s) || !s) return { key: 'new', he };
  return { key: 'active', he };
}
export type Lead = { source: string; id: string; name: string | null; contact: string | null; phone: string | null; lang: string | null; status: string | null; detail: string | null; created_at: string };
export type LeadFilters = { q?: string; source?: string; days?: number; stage?: string };

export function normalizePhone(p: string | null | undefined) {
  const d = (p ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('972')) return '0' + d.slice(3);
  return d;
}
export async function fetchLeads(f: LeadFilters, limit = 400): Promise<{ rows: Lead[]; total: number }> {
  const db = getSupabaseAdmin();
  let q = db.from('leads_feed').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(limit);
  if (f.source) q = q.eq('source', f.source);
  if (f.days) q = q.gt('created_at', new Date(Date.now() - f.days * 864e5).toISOString());
  if (f.q) {
    const t = f.q.trim().replace(/[%,()]/g, ''); const digits = t.replace(/\D/g, '');
    const parts = [`name.ilike.%${t}%`, `contact.ilike.%${t}%`];
    if (digits.length >= 4) { parts.push(`phone.ilike.%${digits}%`); if (digits.startsWith('0')) parts.push(`phone.ilike.%972${digits.slice(1)}%`); }
    q = q.or(parts.join(','));
  }
  const r = await q;
  if (r.error) throw r.error;
  let rows = (r.data ?? []) as Lead[];
  if (f.stage) rows = rows.filter(l => stage(l.source, l.status).key === f.stage);
  return { rows, total: r.count ?? rows.length };
}
/** Groups touch-points by phone so one family shows once with all its sources. */
export function groupByPhone(rows: Lead[]) {
  const map = new Map<string, { phone: string; name: string; contact: string; sources: Set<string>; first: string; last: string; touches: number; latest: Lead }>();
  for (const l of rows) {
    const key = normalizePhone(l.phone) || `${l.source}:${l.id}`;
    const g = map.get(key);
    if (!g) map.set(key, { phone: normalizePhone(l.phone), name: l.name ?? '', contact: l.contact ?? '', sources: new Set([l.source]), first: l.created_at, last: l.created_at, touches: 1, latest: l });
    else { g.sources.add(l.source); g.touches += 1; if (l.created_at < g.first) g.first = l.created_at; if (l.created_at > g.last) { g.last = l.created_at; g.latest = l; } if (!g.name && l.name) g.name = l.name; if (!g.contact && l.contact) g.contact = l.contact; }
  }
  return Array.from(map.values()).sort((a, b) => b.last.localeCompare(a.last));
}
