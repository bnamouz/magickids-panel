import type { SupabaseClient } from '@supabase/supabase-js';

export type FollowUpCall = {
  id: string; created_at: string; call_started_at: string | null; caller_name: string | null;
  child_name: string | null; outcome: string | null; next_action: string | null; purpose: string | null;
  linked_case_id: string | null; reason: string;
};

const WINDOW_DAYS = 14;

/** Why a call needs a human, or null when it does not. */
export function followUpReason(c: { outcome: string | null; next_action: string | null; agent_tool_calls: any; raw_summary: any; duration_seconds?: number | null }): string | null {
  if (c.raw_summary?.follow_up_done_at) return null;
  const tools: any[] = Array.isArray(c.agent_tool_calls) ? c.agent_tool_calls : [];
  const names = tools.map((t) => String(t?.tool_name ?? ''));
  if (c.outcome === 'escalated' || names.some((n) => n.includes('escalate'))) return 'הסלמה לצוות';
  if (c.outcome === 'error') return 'שגיאה בשיחה';
  const failed = tools.some((t) => /"success"\s*:\s*false|"error"\s*:\s*"/i.test(typeof t?.result === 'string' ? t.result : JSON.stringify(t?.result ?? '')));
  if (failed) return 'פעולה של שרה נכשלה';
  if (c.outcome === 'dropped' && Number(c.duration_seconds) >= 20) return 'השיחה נותקה באמצע';
  return null;
}

/** Recent voice calls that still need staff attention. Throws on load failure. */
export async function loadCallFollowUps(db: SupabaseClient): Promise<FollowUpCall[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
  const { data, error } = await db.from('voice_calls')
    .select('id, created_at, call_started_at, caller_name, child_name, outcome, next_action, purpose, linked_case_id, duration_seconds, agent_tool_calls, raw_summary')
    .gte('created_at', since).order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  const out: FollowUpCall[] = [];
  for (const c of data ?? []) {
    const reason = followUpReason(c as any);
    if (reason) out.push({ id: c.id, created_at: c.created_at, call_started_at: c.call_started_at, caller_name: c.caller_name,
      child_name: c.child_name, outcome: c.outcome, next_action: c.next_action, purpose: c.purpose, linked_case_id: c.linked_case_id, reason });
  }
  return out;
}
