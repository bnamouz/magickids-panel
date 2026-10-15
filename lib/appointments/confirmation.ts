import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { firstRelated } from '@/lib/intake/progress';
import { notifyMagicKidsOnce } from '@/lib/appointments/magic-kids-whatsapp';
import { emailOnce } from '@/lib/therapists/mail';
import { confirmationMessage, type ConfirmationResult } from './confirmation-copy';

export const confirmationSchema = z.object({
  email: z.boolean(),
  whatsapp: z.boolean(),
  language: z.enum(['he', 'ar']),
  consentConfirmed: z.literal(true),
  expectedEmail: z.string().max(254),
  expectedPhone: z.string().max(30),
  expectedStart: z.string().datetime({ offset: true }),
  expectedLocation: z.string().max(200),
}).strict();

export function confirmationKey(id: string, channel: 'email' | 'whatsapp') {
  return `appointment-confirmation:${id}:${channel}`;
}
function phoneNumber(value: string) {
  if (!/^[+\d() .-]{7,30}$/.test(value)) return null;
  const digits = value.replace(/\D/g, '');
  const normalized = digits.startsWith('0') ? `+972${digits.slice(1)}` : `+${digits}`;
  return /^\+[1-9]\d{6,14}$/.test(normalized) ? normalized : null;
}

// Deliberately off by default. Existing Gmail/UltraMsg configuration alone never
// enables this feature. No background retries and no automatic historical sends.
export async function sendAppointmentConfirmation(id: string, raw: unknown): Promise<ConfirmationResult> {
  const request = confirmationSchema.parse(raw);
  const result: ConfirmationResult = {
    email: request.email ? 'disabled' : 'not_requested',
    whatsapp: request.whatsapp ? 'disabled' : 'not_requested',
  };
  const mode = process.env.APPOINTMENT_CONFIRMATIONS_MODE;
  if (mode !== 'test' && mode !== 'live') return result;
  const db = getSupabaseAdmin();
  try {
    const appointment = await db.from('appointments')
      .select('id,session_id,status,calendar_sync,scheduled_at,location')
      .eq('id', id).maybeSingle();
    if (appointment.error) throw new Error('unavailable');
    const a = appointment.data;
    if (!a || !['scheduled', 'confirmed'].includes(a.status) ||
      a.calendar_sync !== 'synced' || !(Date.parse(a.scheduled_at) > Date.now()) ||
      Date.parse(a.scheduled_at) !== Date.parse(request.expectedStart) ||
      (a.location ?? '') !== request.expectedLocation) {
      return { email: request.email ? 'blocked' : 'not_requested', whatsapp: request.whatsapp ? 'blocked' : 'not_requested' };
    }
    const session = await db.from('intake_sessions').select('parents(email,phone)').eq('id', a.session_id).maybeSingle();
    if (session.error || !session.data) throw new Error('unavailable');
    const parent = firstRelated<any>(session.data.parents);
    const email = String(parent?.email ?? '').trim();
    const phone = String(parent?.phone ?? '').trim();
    const normalizedPhone = phoneNumber(phone);
    const body = confirmationMessage(a.scheduled_at, a.location, request.language);
    // Separate results: failure of one channel must not misreport the other.
    for (const channel of ['email', 'whatsapp'] as const) {
      if (!request[channel]) continue;
      const expected = channel === 'email' ? request.expectedEmail : request.expectedPhone;
      const actual = channel === 'email' ? email : phone;
      if (actual !== expected.trim()) { result[channel] = 'contact_changed'; continue; }
      if (channel === 'email' ? !z.string().email().safeParse(email).success : !normalizedPhone) {
        result[channel] = 'missing_contact'; continue;
      }
      if (mode === 'test' && (channel === 'email'
        ? email !== process.env.APPOINTMENT_TEST_EMAIL
        : normalizedPhone !== process.env.APPOINTMENT_TEST_PHONE)) {
        result[channel] = 'test_blocked'; continue;
      }
      // Recheck before each provider operation, including cancellation/time changes.
      const current = await db.from('appointments').select('status,calendar_sync,scheduled_at,location').eq('id', id).maybeSingle();
      if (current.error) { result[channel] = 'unavailable'; continue; }
      if (!current.data || !['scheduled', 'confirmed'].includes(current.data.status) ||
        current.data.calendar_sync !== 'synced' || current.data.scheduled_at !== a.scheduled_at ||
        current.data.location !== a.location || !(Date.parse(current.data.scheduled_at) > Date.now())) {
        result[channel] = 'blocked'; continue;
      }
      try {
        result[channel] = channel === 'email'
          ? await emailOnce(confirmationKey(id, channel), email, request.language === 'he' ? 'Magic Kids | אישור תור' : 'Magic Kids | تأكيد موعد', body)
          : await notifyMagicKidsOnce(confirmationKey(id, channel), normalizedPhone!, body);
      } catch { result[channel] = 'unknown'; }
    }
    return result;
  } catch {
    return { email: request.email ? 'unavailable' : 'not_requested', whatsapp: request.whatsapp ? 'unavailable' : 'not_requested' };
  }
}
