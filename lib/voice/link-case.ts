import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { firstRelated } from '@/lib/intake/progress';
import { normalisePhone } from '@/lib/voice-auth';

/**
 * Link a finished voice call to an ADHD intake case.
 *
 * Order of evidence (strongest first):
 * 1. A case_id the agent used in a tool call during the call, accepted only if
 *    the case's parent phone matches the caller or the phone sent to the tool.
 * 2. The caller's phone, accepted only when it identifies exactly one case
 *    (one active case, or a single historical case when none is active).
 *
 * Ambiguous matches are left unlinked on purpose: a wrong link would show one
 * family's call inside another family's file.
 */

const INACTIVE = new Set(['reported', 'closed', 'cancelled']);

export type CaseLink = {
  caseId: string | null;
  method: 'tool_case_id' | 'caller_phone' | null;
  candidates: number;
};

/** Local and E.164 spellings stored in parents.phone. */
export function phoneVariants(raw: string | null | undefined): string[] {
  const e164 = normalisePhone(raw);
  if (!e164) return [];
  const local = '0' + e164.slice(4);
  return Array.from(new Set([e164, e164.slice(1), local]));
}

function parseParams(params: unknown): Record<string, unknown> {
  if (!params) return {};
  if (typeof params === 'string') {
    try {
      const parsed = JSON.parse(params);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof params === 'object' ? (params as Record<string, unknown>) : {};
}

export function toolCaseCandidates(toolCalls: Array<Record<string, unknown>>): Array<{ caseId: string; phone: string | null }> {
  const out: Array<{ caseId: string; phone: string | null }> = [];
  for (const tc of toolCalls) {
    const p = parseParams(tc.params);
    const id = p.case_id ?? p.session_id;
    if (typeof id === 'string' && z.string().uuid().safeParse(id).success) {
      const phone = (p.parent_phone ?? p.phone) as unknown;
      out.push({ caseId: id, phone: typeof phone === 'string' ? phone : null });
    }
  }
  return out;
}

export async function findCaseForCall(
  db: SupabaseClient,
  callerPhone: string | null | undefined,
  toolCalls: Array<Record<string, unknown>> = [],
): Promise<CaseLink> {
  const caller = normalisePhone(callerPhone);

  // 1. Case id used by the agent, verified against the phone on file.
  for (const cand of toolCaseCandidates(toolCalls).reverse()) {
    const { data, error } = await db
      .from('intake_sessions')
      .select('id, parents(phone)')
      .eq('id', cand.caseId)
      .maybeSingle();
    if (error || !data) continue;
    const onFile = normalisePhone(firstRelated<any>(data.parents)?.phone);
    if (onFile && (onFile === caller || onFile === normalisePhone(cand.phone))) {
      return { caseId: data.id, method: 'tool_case_id', candidates: 1 };
    }
  }

  // 2. Caller phone, only when unambiguous.
  const variants = phoneVariants(callerPhone);
  if (!variants.length) return { caseId: null, method: null, candidates: 0 };

  const parents = await db.from('parents').select('id, patient_id').in('phone', variants);
  if (parents.error || !parents.data?.length) return { caseId: null, method: null, candidates: 0 };

  const parentIds = parents.data.map((p) => p.id);
  const patientIds = Array.from(new Set(parents.data.map((p) => p.patient_id).filter(Boolean)));
  const filters = [`primary_parent_id.in.(${parentIds.join(',')})`];
  if (patientIds.length) filters.push(`patient_id.in.(${patientIds.join(',')})`);

  const sessions = await db
    .from('intake_sessions')
    .select('id, status, created_at')
    .or(filters.join(','))
    .order('created_at', { ascending: false });
  if (sessions.error || !sessions.data?.length) return { caseId: null, method: null, candidates: 0 };

  const all = sessions.data;
  const active = all.filter((s) => !INACTIVE.has(String(s.status)));
  if (active.length === 1) return { caseId: active[0].id, method: 'caller_phone', candidates: all.length };
  if (active.length === 0 && all.length === 1) return { caseId: all[0].id, method: 'caller_phone', candidates: 1 };
  return { caseId: null, method: null, candidates: all.length };
}
