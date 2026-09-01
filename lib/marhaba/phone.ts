// lib/marhaba/phone.ts
// Israeli phone normalization — matches pattern in app/api/nour/outbound-call/route.ts

export function normalizeIsraeliPhone(raw: string): string {
  if (!raw) return '';
  let cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '+972' + cleaned.slice(1);
  } else if (cleaned.startsWith('972') && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  } else if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  return cleaned;
}

export function isValidIsraeliMobile(phone: string): boolean {
  const normalized = normalizeIsraeliPhone(phone);
  return /^\+9725\d{8}$/.test(normalized);
}

/** Format for UltraMsg WhatsApp (E.164 without leading + is OK too but +972 works) */
export function toWhatsAppFormat(phone: string): string {
  return normalizeIsraeliPhone(phone);
}
