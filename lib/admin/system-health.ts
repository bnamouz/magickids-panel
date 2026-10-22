import { clinicWhatsAppIdentity, doctorWhatsAppIdentity, providerAccountStatus, explainProviderStatus } from '@/lib/whatsapp-clinic';
import { getCalendarClient, getCalendarId } from '@/lib/google-calendar';
import { getPediatricsCalendarId } from '@/lib/pediatrics-calendar';
import { getSupabaseAdmin } from '@/lib/supabase';
import { ownerWhatsAppIdentity } from '@/lib/appointments/owner-whatsapp-identity';

export type Level = 'ok' | 'warn' | 'fail';
export type Check = { id: string; group: string; label: string; level: Level; detail: string };

const PANEL_HOST = 'app.magickidsinstitute.com';
const T = 10000;

async function safe(id: string, group: string, label: string, fn: () => Promise<[Level, string]>): Promise<Check> {
  try { const [level, detail] = await fn(); return { id, group, label, level, detail }; }
  catch { return { id, group, label, level: 'fail', detail: 'הבדיקה נכשלה או לא הגיבה בזמן' }; }
}

async function agentCheck(id: string | undefined, name: string): Promise<[Level, string]> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  const agentId = id?.replace(/\\n/g, '').trim();
  if (!key || !agentId) return ['fail', 'מפתח או מזהה סוכנת חסרים בהגדרות השרת'];
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, { headers: { 'xi-api-key': key }, cache: 'no-store', signal: AbortSignal.timeout(T) });
  if (!r.ok) return ['fail', `ElevenLabs לא החזיר את ${name} (${r.status})`];
  const d = await r.json();
  const tools: any[] = d.conversation_config?.agent?.prompt?.tools ?? [];
  const foreign = tools.filter((t) => { try { return new URL(t.api_schema?.url).host !== PANEL_HOST; } catch { return true; } });
  const webhook = d.platform_settings?.workspace_overrides?.webhooks?.post_call_webhook_id;
  const problems: string[] = [];
  if (!webhook) problems.push('רישום שיחות לפאנל כבוי');
  if (foreign.length) problems.push(`${foreign.length} כלים מפנים לכתובת אחרת מ־${PANEL_HOST}`);
  return problems.length ? ['warn', problems.join(' · ')] : ['ok', `${tools.length} כלים מחוברים לפאנל, רישום שיחות פעיל`];
}

export async function runSystemHealth(): Promise<Check[]> {
  const db = getSupabaseAdmin();
  const checks = await Promise.all([
    safe('db', 'תשתית', 'מסד הנתונים', async () => {
      const r = await db.from('intake_sessions').select('id', { head: true, count: 'exact' });
      return r.error ? ['fail', 'אין גישה למסד'] : ['ok', `${r.count ?? 0} תיקים במערכת`];
    }),
    ...([['adhd', 'יומן המכון (קשב)', getCalendarId()], ['pediatrics', 'יומן מרפאת הילדים', getPediatricsCalendarId()]] as const).map(([id, label, calendarId]) =>
      safe(`calendar_${id}`, 'יומנים', label, async () => {
        const r = await getCalendarClient().calendarList.get({ calendarId });
        const writable = ['writer', 'owner'].includes(r.data.accessRole ?? '');
        return writable ? ['ok', `מחובר עם הרשאת כתיבה: ${r.data.summary ?? ''}`] : ['fail', 'אין הרשאת כתיבה ליומן'];
      })),
    safe('calendar_sync', 'יומנים', 'סנכרון תורים עתידיים', async () => {
      const r = await db.from('appointments').select('calendar_sync').gt('scheduled_at', new Date().toISOString());
      if (r.error) return ['fail', 'לא ניתן לבדוק'];
      const bad = (r.data ?? []).filter((a) => a.calendar_sync !== 'synced').length;
      return bad ? ['warn', `${bad} מתוך ${r.data!.length} תורים עתידיים לא מסונכרנים ל־Google`] : ['ok', `${r.data!.length} תורים עתידיים מסונכרנים`];
    }),
    safe('wa_institute', 'וואטסאפ', 'וואטסאפ המכון 054-402-0043 (שרה: קישורי הרשמה, אישורי תורים, MOXO, הודעות להורים)', async () => {
      const s = await ownerWhatsAppIdentity();
      return s === 'verified' ? ['ok', 'מחובר, זהות השולח אומתה']
        : s === 'not_configured' ? ['fail', 'לא מוגדר'] : s === 'identity_mismatch' ? ['fail', 'זהות השולח אינה תואמת'] : ['warn', 'לא ניתן לאמת כרגע'];
    }),
    safe('wa_clinic', 'וואטסאפ', 'וואטסאפ המרפאה 054-349-6656 (נור: אישורי תור, תזכורות, בקשות ללא תור)', async () => {
      const s = await clinicWhatsAppIdentity(true);
      return s === 'verified' ? ['ok', 'מחובר, זהות השולח אומתה']
        : s === 'not_configured' ? ['warn', 'עוד לא הוגדר (CLINIC_ULTRAMSG_TOKEN חסר). בינתיים נשלח מהמספר של ד״ר נמוז'] : s === 'identity_mismatch' ? ['fail', 'החיבור שייך למספר אחר; לא נשלח ממנו'] : ['warn', explainProviderStatus(await providerAccountStatus('clinic'), '054-349-6656', process.env.CLINIC_ULTRAMSG_INSTANCE_ID ?? '')];
    }),
    safe('wa_doctor', 'וואטסאפ', 'וואטסאפ ד״ר נמוז 050-995-5137 (מאגר המרפאה, בקשות לרופא, גיבוי למרפאה)', async () => {
      const s = await doctorWhatsAppIdentity(true);
      return s === 'verified' ? ['ok', 'מחובר, זהות השולח אומתה']
        : s === 'not_configured' ? ['fail', 'עוד לא חובר. יש לסרוק QR ב־UltraMsg (instance174062) מהטלפון 050-995-5137'] : s === 'identity_mismatch' ? ['fail', 'החיבור שייך למספר אחר; לא נשלח ממנו'] : ['warn', explainProviderStatus(await providerAccountStatus('doctor'), '050-995-5137', process.env.ULTRAMSG_INSTANCE_ID ?? '')];
    }),
    safe('agent_sarah', 'סוכני קול', 'שרה (מענה המכון)', () => agentCheck(process.env.ELEVENLABS_AGENT_ID, 'שרה')),
    safe('agent_nour', 'סוכני קול', 'נור (מזכירה אישית)', () => agentCheck(process.env.NOUR_ELEVENLABS_AGENT_ID, 'נור')),
    safe('twilio', 'סוכני קול', 'Twilio (מספרי הטלפון)', async () => {
      const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
      if (!sid || !tok) return ['fail', 'לא מוגדר'];
      const auth = 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64');
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PageSize=20`, { headers: { authorization: auth }, cache: 'no-store', signal: AbortSignal.timeout(T) });
      if (!r.ok) return ['fail', `Twilio החזיר ${r.status}`];
      const nums: string[] = ((await r.json()).incoming_phone_numbers ?? []).map((n: any) => n.phone_number);
      const want = [process.env.TWILIO_PHONE_NUMBER, process.env.NOUR_TWILIO_PHONE_NUMBER].map((n) => n?.replace(/\\n/g, '').trim()).filter(Boolean) as string[];
      const missing = want.filter((n) => !nums.includes(n));
      return missing.length ? ['warn', `${missing.length} מספרים מוגדרים אינם בחשבון`] : ['ok', `${nums.length} מספרים פעילים בחשבון`];
    }),
    safe('call_log', 'סוכני קול', 'שיחה אחרונה שנקלטה בפאנל', async () => {
      const r = await db.from('voice_calls').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (r.error) return ['fail', 'לא ניתן לבדוק'];
      if (!r.data) return ['warn', 'עדיין לא נקלטו שיחות'];
      const days = Math.floor((Date.now() - Date.parse(r.data.created_at)) / 86400_000);
      const when = new Date(r.data.created_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
      return days > 7 ? ['warn', `לא נקלטה שיחה ${days} ימים (אחרונה: ${when}). אם היו שיחות, הרישום לא עובד`] : ['ok', `אחרונה: ${when}`];
    }),
  ]);
  return checks;
}
