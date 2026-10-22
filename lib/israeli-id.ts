/** Israeli ID (teudat zehut) checksum: 9 digits, Luhn-like weights 1,2,1,2,… Accepts digits typed with spaces/dashes or Arabic-Indic numerals. */
export function normalizeIsraeliId(raw: string): string {
  return raw.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6f0)).replace(/[\s-]/g, '');
}
export function isValidIsraeliId(raw: string): boolean {
  const id = normalizeIsraeliId(raw);
  if (!/^[0-9]{9}$/.test(id) || id === '000000000') return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) { let n = Number(id[i]) * (i % 2 === 0 ? 1 : 2); if (n > 9) n -= 9; sum += n; }
  return sum % 10 === 0;
}
