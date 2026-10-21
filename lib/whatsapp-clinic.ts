/**
 * Pediatric clinic WhatsApp senders, each verified against the provider before sending:
 *  - clinic : the clinic's own number 054-349-6656  (CLINIC_ULTRAMSG_INSTANCE_ID / CLINIC_ULTRAMSG_TOKEN)
 *  - doctor : Dr. Baseem Namouz's number 050-995-5137 (shared ULTRAMSG_INSTANCE_ID / ULTRAMSG_TOKEN)
 * Clinic confirmations and reminders prefer clinic → doctor → institute (see preferredClinicSender);
 * clinic-patient messages and doctor-request replies default to the doctor's number.
 */
export type SenderKind = 'clinic' | 'doctor';
export type ClinicIdentity = 'verified' | 'not_configured' | 'identity_mismatch' | 'identity_unavailable';
const BASE = 'https://api.ultramsg.com';

export const SENDERS: Record<SenderKind, { number: string; local: string; label: string }> = {
  clinic: { number: '+972543496656', local: '054-349-6656', label: 'מרפאת הילדים' },
  doctor: { number: '+972509955137', local: '050-995-5137', label: 'ד״ר נמוז' },
};
export const CLINIC_SENDER = SENDERS.clinic.number;
export const CLINIC_SENDER_LOCAL = SENDERS.clinic.local;
export const DOCTOR_SENDER = SENDERS.doctor.number;
export const DOCTOR_SENDER_LOCAL = SENDERS.doctor.local;

function creds(kind: SenderKind) {
  const [i, t] = kind === 'clinic' ? [process.env.CLINIC_ULTRAMSG_INSTANCE_ID, process.env.CLINIC_ULTRAMSG_TOKEN] : [process.env.ULTRAMSG_INSTANCE_ID, process.env.ULTRAMSG_TOKEN];
  return i && t ? { instance: i.trim(), token: t.trim() } : null;
}

const cache: Partial<Record<SenderKind, { at: number; value: ClinicIdentity }>> = {};

export async function senderIdentity(kind: SenderKind, fresh = false): Promise<ClinicIdentity> {
  const c0 = cache[kind];
  // A verified/mismatch answer is good for a minute; a provider hiccup is only remembered for a few seconds.
  if (!fresh && c0 && Date.now() - c0.at < (c0.value === 'identity_unavailable' ? 5_000 : 60_000)) return c0.value;
  const c = creds(kind);
  let value: ClinicIdentity = 'not_configured';
  if (c) {
    // The provider occasionally times out or answers slowly; retry before giving up so a brief hiccup never changes the sender.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const url = new URL(`${BASE}/${c.instance}/instance/me`); url.searchParams.set('token', c.token);
        const r = await fetch(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) });
        const d = r.ok ? await r.json().catch(() => null) : null;
        value = typeof d?.id !== 'string' ? 'identity_unavailable' : d.id === `${SENDERS[kind].number.slice(1)}@c.us` ? 'verified' : 'identity_mismatch';
      } catch { value = 'identity_unavailable'; }
      if (value !== 'identity_unavailable') break;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  cache[kind] = { at: Date.now(), value };
  return value;
}
export const clinicWhatsAppIdentity = (fresh = false) => senderIdentity('clinic', fresh);
export const doctorWhatsAppIdentity = (fresh = false) => senderIdentity('doctor', fresh);

export async function sendFromSender(kind: SenderKind, args: { toPhone: string; body: string }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const identity = await senderIdentity(kind);
  if (identity !== 'verified') return { ok: false, error: `${kind}_whatsapp_${identity}` };
  const c = creds(kind)!;
  try {
    const res = await fetch(`${BASE}/${c.instance}/messages/chat`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: c.token, to: args.toPhone, body: args.body, priority: '10' }).toString(),
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error || !data?.id) { delete cache[kind]; return { ok: false, error: data?.error ? 'provider_rejected' : `HTTP ${res.status}` }; }
    return { ok: true, id: String(data.id) };
  } catch { return { ok: false, error: 'send_uncertain' }; }
}
export const sendClinicWhatsAppText = (args: { toPhone: string; body: string }) => sendFromSender('clinic', args);
export const sendDoctorWhatsAppText = (args: { toPhone: string; body: string }) => sendFromSender('doctor', args);

/** Sender for clinic confirmations/reminders: the clinic number, else the doctor's number, else the institute. */
export async function preferredClinicSender(): Promise<{ sender: 'clinic' | 'doctor' | 'institute'; fallbackReason: string | null }> {
  const clinic = await senderIdentity('clinic').catch(() => 'identity_unavailable' as const);
  if (clinic === 'verified') return { sender: 'clinic', fallbackReason: null };
  const doctor = await senderIdentity('doctor').catch(() => 'identity_unavailable' as const);
  if (doctor === 'verified') return { sender: 'doctor', fallbackReason: `clinic_${clinic}` };
  return { sender: 'institute', fallbackReason: `clinic_${clinic},doctor_${doctor}` };
}
