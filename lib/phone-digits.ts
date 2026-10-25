/** Phone text hygiene shared by forms and admin editors:
 *  Arabic-Indic (٠١٢…) and Persian (۰۱۲…) digits → ASCII, bidi/format marks removed, NBSP → space. */
export function asciiDigits(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/\u00a0/g, ' ')
    .trim();
}
