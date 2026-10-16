import { z } from 'zod';

/** Israeli ID check digit (Luhn variant). Accepts 5–9 digits, zero-padded to 9. */
export function validIsraeliId(raw: string): boolean {
  if (!/^\d{5,9}$/.test(raw)) return false;
  const s = raw.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) { let d = Number(s[i]) * ((i % 2) + 1); if (d > 9) d -= 9; sum += d; }
  return sum % 10 === 0;
}

/** Local Israeli phone, digits only. '' / 0000000000 → null. +972/972 → 0. */
export function normalisePatientPhone(raw: unknown): string | null {
  let s = String(raw ?? '').replace(/\D/g, '');
  if (!s || /^0+$/.test(s)) return null;
  if (s.startsWith('972')) s = '0' + s.slice(3);
  if (!s.startsWith('0')) s = '0' + s;
  return /^0\d{8,9}$/.test(s) ? s : 'invalid';
}

/** Accepts YYYY-MM-DD or DD/MM/YYYY (also DD.MM.YYYY). '' → null. */
export function normaliseDate(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let iso = m ? s : null;
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (!iso) return 'invalid';
  const d = new Date(iso + 'T12:00:00Z');
  return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? 'invalid' : iso;
}

const name = z.string().trim().min(1).max(80);
const phone = z.union([z.string(), z.null(), z.undefined()]).transform(normalisePatientPhone).refine(v => v !== 'invalid', 'invalid_phone');
const date = z.union([z.string(), z.null(), z.undefined()]).transform(normaliseDate).refine(v => v !== 'invalid', 'invalid_date');

export const patientSchema = z.object({
  id: z.string().uuid().optional(),
  national_id: z.string().trim().transform(v => v.replace(/\D/g, '')).refine(validIsraeliId, 'invalid_id'),
  first_name: name,
  last_name: name,
  phone1: phone,
  phone2: phone,
  birth_date: date,
  last_visit: date,
  next_visit: date,
  notes: z.string().max(2000).optional().nullable().transform(v => v?.trim() || null),
  needs_review: z.boolean().optional(),
  missing_height_weight: z.boolean().optional(),
  whatsapp_opt_out: z.boolean().optional(),
});
export type PatientInput = z.infer<typeof patientSchema>;

export type ClinicPatient = {
  id: string; national_id: string; first_name: string; last_name: string;
  phone1: string | null; phone2: string | null; birth_date: string | null;
  last_visit: string | null; next_visit: string | null; notes: string | null;
  needs_review: boolean; source: string; updated_at: string; extra?: Record<string, unknown> | null;
};

/** Column order for pasted rows (Excel/Sheets copy = tab separated). */
export const BULK_COLUMNS = ['national_id', 'first_name', 'last_name', 'phone1', 'phone2', 'last_visit', 'next_visit'] as const;

export function parseBulk(text: string) {
  const ok: PatientInput[] = []; const errors: { line: number; reason: string }[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cells = line.includes('\t') ? line.split('\t') : line.split(',');
    if (i === 0 && !/\d/.test(cells[0] ?? '')) return; // header row
    const row: Record<string, string> = {};
    BULK_COLUMNS.forEach((k, j) => { row[k] = (cells[j] ?? '').trim(); });
    const r = patientSchema.safeParse(row);
    if (r.success) ok.push(r.data); else errors.push({ line: i + 1, reason: r.error.issues[0]?.message ?? 'invalid' });
  });
  return { ok, errors };
}
