import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertVoiceAuth, normalisePhone } from '@/lib/voice-auth';
import {book,BookingError} from '@/lib/booking/server';
import {createHash} from 'node:crypto';
import { notifyOnce } from '@/lib/moxo/notification';
import { cancellationToken } from '@/lib/booking/server';

/**
 * POST /api/voice/book-appointment
 *
 * Books a general (non-Maccabi) appointment for Dr. Basim's clinic
 * on the "Pediatrics Clinic Appointments" calendar.
 *
 * Called by Nour (personal secretary voice agent) when a caller
 * requests to book with Dr. Basim.
 *
 * Body:
 *   {
 *     patient_name: string,           // full name of the patient
 *     parent_name?: string,           // caller's name if different from patient
 *     parent_phone: string,           // callback phone number
 *     scheduled_at: string,           // ISO datetime, e.g. "2026-09-05T09:30:00+03:00"
 *     duration_minutes?: number,      // default 10
 *     reason?: string,                // brief reason
 *     language?: 'ar' | 'he' | 'en',  // for WhatsApp confirmation
 *     send_confirmation?: boolean,    // default true
 *   }
 */

const BodySchema = z.object({
  patient_name: z.string().min(1),
  parent_name: z.string().optional(),
  parent_phone: z.string().optional(),
  caller_id: z.string().optional(),
  scheduled_at: z.string().min(1),
  duration_minutes: z.number().int().positive().max(240).optional(),
  reason: z.string().optional(),
  language: z.enum(['ar', 'he', 'en']).optional(),
  send_confirmation: z.boolean().optional(),
});

function formatDateForMessage(iso: string, lang: 'ar' | 'he' | 'en'): string {
  const d = new Date(iso);
  const locale = lang === 'ar' ? 'ar-IL' : lang === 'he' ? 'he-IL' : 'en-IL';
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Jerusalem',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export async function POST(req: NextRequest) {
  const unauth = assertVoiceAuth(req);
  if (unauth) return unauth;

  let body: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json();
    body = BodySchema.parse(raw);
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: 'invalid_body', details: e?.message || String(e) },
      { status: 400 },
    );
  }

  // Default to the caller's own number (caller ID) when no other number was dictated.
  const phone = normalisePhone(body.parent_phone || '') || normalisePhone(body.caller_id || '');
  if (!phone) {
    return NextResponse.json(
      { success: false, error: 'invalid_phone', instruction: 'Ask for the number again, repeat it digit by digit, and pass it as 10 local digits starting with 05.' },
      { status: 400 },
    );
  }

  // Validate scheduled_at
  const when = new Date(body.scheduled_at);
  if (isNaN(when.getTime())) {
    return NextResponse.json(
      { success: false, error: 'invalid_scheduled_at' },
      { status: 400 },
    );
  }

  const duration = body.duration_minutes ?? 10;
  if(duration!==10)return NextResponse.json({success:false,error:'pediatrics_duration_must_be_10'},{status:400});

  const start=when.toISOString();
  const hash=createHash('sha256').update(JSON.stringify([phone,start,body.patient_name])).digest('hex');
  const requestId=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
  let reference=requestId;
  try{
    const result:any=await book('pediatrics',{requestId,start,childName:body.patient_name,parentName:body.parent_name||body.patient_name,phone,consent:true,website:''},`voice:${phone}`);
    if(result?.reference)reference=result.reference;
  }catch(error){
    const code=error instanceof BookingError?error.code:'unavailable';
    return NextResponse.json({success:false,error:code,
      instruction:code==='invalid_slot'||code==='slot_taken'?'This time is not free. Call get_clinic_slots again and offer only returned slots.':'Booking failed. Do not say it was booked.'},
      {status:error instanceof BookingError?error.status:503});
  }
  const eventInfo={eventId:'mk'+requestId.replaceAll('-',''),htmlLink:undefined};

  // WhatsApp confirmation from the verified institute number, sent at most once per booking.
  let notification:string='not_requested';
  if (body.send_confirmation !== false) {
    const lang = body.language === 'he' ? 'he' : body.language === 'en' ? 'en' : 'ar';
    const when_str = formatDateForMessage(start, lang);
    const cancel=`https://app.magickidsinstitute.com/book/cancel?lang=${lang==='en'?'he':lang}#id=${reference}&token=${cancellationToken(reference)}`;
    const patient = body.patient_name;
    const msg = lang === 'he'
      ? [`שלום, אושר תור במרפאת הילדים של ד״ר בסים נמוז עבור ${patient}.`,'',`מועד: ${when_str} (10 דקות)`,'מקום: רחוב תופיק זיאד 21, שפרעם','',`לביטול התור: ${cancel}`,'וואטסאפ מרפאת הילדים: 0543496656'].join('\n')
      : lang === 'en'
      ? [`Hello, an appointment at Dr. Baseem Namouz's pediatric clinic is confirmed for ${patient}.`,'',`When: ${when_str} (10 minutes)`,'Where: 21 Tawfiq Ziad St., Shefa-Amr','',`To cancel: ${cancel}`,'Pediatric clinic WhatsApp: 0543496656'].join('\n')
      : [`مرحبًا، تأكّد دور ${patient} في عيادة الأطفال عند الدكتور بسيم نموز.`,'',`الموعد: ${when_str} (10 دقائق)`,'المكان: شارع توفيق زياد 21، شفاعمرو','',`لإلغاء الدور: ${cancel}`,'واتساب عيادة الأطفال: 0543496656'].join('\n');
    notification = await notifyOnce(`pediatrics-voice:${reference}`, phone, msg, { sender: 'institute' }).catch(() => 'unknown');
  }
  const whatsappId = notification === 'accepted' ? 'accepted' : undefined;

  return NextResponse.json({
    success: true,
    event_id: eventInfo.eventId,
    calendar_link: eventInfo.htmlLink,
    whatsapp_message_id: whatsappId,
    whatsapp_confirmation: notification,
    scheduled_at: start,
  });
}
