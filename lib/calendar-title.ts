/**
 * One title format for every event the system writes to Google Calendar:
 *   "<שם המוזמן> · <סוג הביקור>"
 * The invitee's name comes first so it is readable even when the calendar truncates titles.
 */
export const VISIT_KIND = {
  assessment: 'אבחון קשב וריכוז', followup: 'מעקב קשב וריכוז', moxo: 'מבדק MOXO', pediatrics: 'מרפאת ילדים',
  doctor_request_pediatrics: 'בקשה ללא תור', doctor_request_adhd: 'בקשה ללא תור · קשב', institute: 'פגישה במכון',
} as const;
export type VisitKind = keyof typeof VISIT_KIND;
export function eventTitle(name: string | null | undefined, kind: VisitKind) {
  const clean = (name ?? '').replace(/\s+/g, ' ').trim();
  return clean ? `${clean} · ${VISIT_KIND[kind]}` : VISIT_KIND[kind];
}
/** Rewrites titles produced by earlier formats ("<סוג> — <שם>") into the current one. Returns null when no change is needed. */
export function modernizeTitle(summary: string | null | undefined): string | null {
  const s = (summary ?? '').trim();
  let m = s.match(/^(אבחון קשב וריכוז|מעקב קשב וריכוז|מרפאת ילדים) — (.+)$/);
  if (m) return eventTitle(m[2], m[1] === 'אבחון קשב וריכוז' ? 'assessment' : m[1] === 'מעקב קשב וריכוז' ? 'followup' : 'pediatrics');
  m = s.match(/^בקשה ללא תור( — קשב וריכוז)? — (.+)$/);
  if (m) return eventTitle(m[2], m[1] ? 'doctor_request_adhd' : 'doctor_request_pediatrics');
  m = s.match(/^מבדק MOXO · ילדי הקסם(?: — (.+))?$/);
  if (m) return eventTitle(m[1], 'moxo');
  m = s.match(/^(.+?) - תור אצל ד"ר בסים$/);
  if (m) return eventTitle(m[1], 'pediatrics');
  return null;
}
