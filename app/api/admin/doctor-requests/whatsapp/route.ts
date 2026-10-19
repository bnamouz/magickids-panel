import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getCalendarClient, getCalendarId } from '@/lib/google-calendar';
import { getPediatricsCalendarId } from '@/lib/pediatrics-calendar';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendInstituteWhatsAppText } from '@/lib/whatsapp-ultramsg';
import { TIME_ZONE } from '@/lib/booking/schedule';

export const dynamic = 'force-dynamic';

const schema = z.object({
  clinic: z.enum(['pediatrics', 'adhd']),
  eventId: z.string().regex(/^[a-v0-9]{5,1024}$/),
  phone: z.string().regex(/^\+?\d{9,15}$/),
  text: z.string().trim().min(5).max(1500),
  templateTitle: z.string().trim().max(80).optional(),
}).strict();

/** Sends a staff-written update about a doctor request to the parent from the institute WhatsApp (054-402-0043).
 *  One send per request+text; every attempt is logged in `notifications`, and the calendar event gets a note. */
export async function POST(req: NextRequest) {
  const staff = await getCurrentStaff();
  if (!staff || req.headers.get('origin') !== req.nextUrl.origin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  const { clinic, eventId, phone: rawPhone, text, templateTitle } = parsed.data;
  const digits = rawPhone.replace(/\D/g, '');
  const phone = digits.startsWith('0') ? `+972${digits.slice(1)}` : `+${digits}`;
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return NextResponse.json({ error: 'מספר טלפון לא תקין' }, { status: 400 });

  // The request must exist as a doctor-request event in the clinic calendar, and the phone must be the one the parent left.
  const calendarId = clinic === 'adhd' ? getCalendarId() : getPediatricsCalendarId();
  let event;
  try { event = (await getCalendarClient().events.get({ calendarId, eventId }, { timeout: 10000 })).data; }
  catch { return NextResponse.json({ error: 'הבקשה לא נמצאה ביומן' }, { status: 404 }); }
  if (event.status === 'cancelled' || !event.extendedProperties?.private?.doctorRequest) return NextResponse.json({ error: 'הבקשה לא נמצאה ביומן' }, { status: 404 });
  const eventPhone = (event.description ?? '').match(/טלפון:\s*(\+?[\d\s()-]{7,20})/)?.[1]?.replace(/\D/g, '') ?? '';
  if (!eventPhone || eventPhone !== phone.slice(1)) return NextResponse.json({ error: 'המספר אינו תואם למספר שבבקשה' }, { status: 409 });

  // Once per request+text (protects against a double click); a different text later is a new message.
  const key = `doctor-request:${eventId}:${createHash('sha256').update(text).digest('hex').slice(0, 16)}`;
  const db = getSupabaseAdmin();
  const inserted = await db.from('clinic_notifications').upsert({ id: key }, { onConflict: 'id', ignoreDuplicates: true });
  if (inserted.error) return NextResponse.json({ error: 'המערכת אינה זמינה כרגע' }, { status: 503 });
  const claim = await db.from('clinic_notifications').update({ state: 'sending', updated_at: new Date().toISOString() }).eq('id', key).in('state', ['pending', 'failed']).select('id').maybeSingle();
  if (claim.error) return NextResponse.json({ error: 'המערכת אינה זמינה כרגע' }, { status: 503 });
  if (!claim.data) return NextResponse.json({ status: 'duplicate', message: 'הודעה זהה כבר נשלחה להורה עבור בקשה זו.' });

  const wa = await sendInstituteWhatsAppText({ toPhone: phone, body: text });
  const state = wa.ok ? 'accepted' : wa.error === 'send_uncertain' ? 'unknown' : 'failed';
  await db.from('clinic_notifications').update({ state, provider_id: wa.ok ? wa.id ?? null : `error:${String(wa.error ?? 'unknown').slice(0, 60)}`, updated_at: new Date().toISOString() }).eq('id', key).eq('state', 'sending');
  const now = new Date();
  await db.from('notifications').insert({
    recipient_type: 'parent', recipient_phone: phone, channel: 'whatsapp', template: 'doctor_request_reply',
    payload: { clinic, event_id: eventId, template_title: templateTitle ?? null, staff_id: staff.id, sender: 'institute', text_length: text.length },
    scheduled_for: now.toISOString(), sent_at: wa.ok ? now.toISOString() : null, status: wa.ok ? 'sent' : 'failed',
    delivery_id: wa.ok ? wa.id ?? null : null, error_message: wa.ok ? null : wa.error ?? 'unknown', retry_count: 0,
  }).then(() => null, () => null);

  if (wa.ok) {
    // Leave a trace on the request itself so whoever opens it next sees the parent was updated.
    const stamp = now.toLocaleString('he-IL', { timeZone: TIME_ZONE, dateStyle: 'short', timeStyle: 'short' });
    const note = `\n\n✔ עודכן להורה בוואטסאפ מהמכון ${stamp}${templateTitle ? ` — ${templateTitle}` : ''}`;
    await getCalendarClient().events.patch({ calendarId, eventId, sendUpdates: 'none', requestBody: { description: `${event.description ?? ''}${note}` } }, { timeout: 10000 }).catch(() => null);
  }
  return NextResponse.json(wa.ok ? { status: 'sent', id: wa.id ?? null } : { status: state, error: wa.error ?? 'unknown' }, { status: wa.ok ? 200 : 502 });
}
