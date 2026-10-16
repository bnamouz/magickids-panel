import { createHash } from 'node:crypto';

export const MAX_BROADCAST = 500;       // recipients per click; the rest continue on the next click
export const BATCH = 12;                // messages per API request (fits in the 60s function limit)
export const isMobile = (p: string | null | undefined): p is string => !!p && /^05\d{8}$/.test(p);

type Row = { id: string; first_name: string; phone1: string | null; phone2: string | null; extra?: any };
export type Recipient = { phone: string; names: string[]; ids: string[] };

/** One message per mobile number. Siblings sharing a number get a single message with all names. */
export function buildRecipients(rows: Row[]) {
  const map = new Map<string, Recipient>(); let optedOut = 0, noMobile = 0;
  for (const r of rows) {
    if (r.extra?.whatsapp_opt_out) { optedOut++; continue; }
    const phones = Array.from(new Set([r.phone1, r.phone2].filter(isMobile)));
    if (!phones.length) { noMobile++; continue; }
    for (const p of phones) {
      const cur = map.get(p) ?? { phone: p, names: [], ids: [] };
      if (!cur.names.includes(r.first_name)) cur.names.push(r.first_name);
      cur.ids.push(r.id); map.set(p, cur);
    }
  }
  const list = Array.from(map.values()).sort((a, b) => a.phone.localeCompare(b.phone));
  return { list, optedOut, noMobile, patients: rows.length };
}

export function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? '';
  return names.slice(0, -1).join(', ') + ' ו' + names[names.length - 1];
}
export const render = (text: string, names: string[]) => text.replace(/\{שם\}/g, joinNames(names)).trim();

/** Same message + same audience → same campaign, so a repeat click never resends to a number. */
export function campaignId(text: string, filter: { f?: string; q?: string }) {
  return createHash('sha256').update(JSON.stringify([text.trim(), filter.f ?? '', (filter.q ?? '').trim()])).digest('hex').slice(0, 16);
}
