import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getCalendarClient } from '@/lib/google-calendar';
import { BookingError, bookingSettings } from './server';
import { clinicHours, localParts, TIME_ZONE, type Clinic } from './schedule';
import { FUND_HE, type Fund } from './payments';
import { eventTitle } from '@/lib/calendar-title';

const name = z.string().trim().min(2).max(100).refine(v => !/[\x00-\x1f\x7f]/.test(v));
export const doctorRequestSchema = z.object({
  requestId: z.string().uuid(), childName: name, parentName: name,
  childId: z.string().trim().regex(/^[0-9]{9}$/).refine(v => v !== '000000000'),
  cardlessVisitConfirmed: z.boolean(),
  clinic: z.enum(['pediatrics','adhd']).default('pediatrics'),
  fund: z.enum(['maccabi','clalit','meuhedet','leumit','private']).optional(),
  phone: z.string().trim().regex(/^[+\d() .-]{7,25}$/),
  message: z.string().trim().min(5).max(1000).refine(v => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v)),
  consent: z.literal(true), language: z.enum(['he','ar','en']), website: z.literal('').default(''),
}).strict();
export function requestDay(now = new Date(), clinic: Clinic = 'pediatrics') {
  const local = localParts(now);
  for (let offset = 0; offset < 15; offset++) {
    const day = new Date(Date.parse(local.date+'T12:00:00Z') + offset*86400000).toISOString().slice(0,10);
    const hours = clinicHours(clinic,day);
    if (hours && (offset > 0 || local.minutes < hours[1])) return day;
  }
  throw new BookingError('unavailable');
}
const nextDay = (day: string) => new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
export async function submitDoctorRequest(input: unknown, ip: string) {
  const parsed = doctorRequestSchema.safeParse(input);
  if (!parsed.success) throw new BookingError('invalid_body',400);
  const body = parsed.data;
  // Pediatrics (Maccabi) always needs the cardless-visit declaration; in ADHD it depends on the stated fund.
  if (body.clinic === 'adhd' && !body.fund) throw new BookingError('invalid_body',400);
  if ((body.clinic === 'pediatrics' || body.fund === 'maccabi') && body.cardlessVisitConfirmed !== true) throw new BookingError('invalid_body',400);
  const adhd = body.clinic === 'adhd';
  const calendarId = bookingSettings()[body.clinic];
  const digest = (value: string) => createHmac('sha256',process.env.BOOKING_HASH_SECRET!).update(value).digest('hex');
  const digits = body.phone.replace(/\D/g,'');
  const phone = body.phone.startsWith('+') ? '+'+digits : digits.startsWith('0') ? '+972'+digits.slice(1) : '+'+digits;
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) throw new BookingError('invalid_body',400);
  const fingerprint = digest(JSON.stringify([body.childName,body.parentName,phone,body.message,body.language,body.childId,body.cardlessVisitConfirmed,...(adhd?['adhd',body.fund]:[])]));
  const {data,error} = await getSupabaseAdmin().rpc('reserve_pediatrics_doctor_request',{
    p_id:body.requestId,p_fingerprint:fingerprint,p_phone:digest('phone:'+phone),p_ip:digest('ip:'+ip),p_day:requestDay(new Date(),body.clinic),p_calendar:calendarId,
  });
  if (error || !data) throw new BookingError('unavailable');
  if (data.error) throw new BookingError(data.error,data.error==='rate_limited'?429:409);
  const day = data.day as string;
  const target = data.calendar_id as string;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !target) throw new BookingError('unavailable');
  const calendar = getCalendarClient();
  const eventId = 'dr'+body.requestId.replaceAll('-','');
  let event;
  try { event = (await calendar.events.get({calendarId:target,eventId},{timeout:10000})).data; }
  catch (e) { if (Number((e as {code?:number}).code)!==404) throw new BookingError('processing'); }
  if (!event) {
    try {
      event = (await calendar.events.insert({calendarId:target,sendUpdates:'none',requestBody:{
        id:eventId,summary:eventTitle(body.childName, adhd?'doctor_request_adhd':'doctor_request_pediatrics'),
        description:`בקשה מהרופא ללא תור${adhd?' (מרפאת קשב וריכוז)':''} — אינה פגישה\nילד/ה: ${body.childName}\nתעודת זהות הילד/ה: ${body.childId}\n${adhd?`קופה: ${FUND_HE[body.fund as Fund]}\n`:''}${body.cardlessVisitConfirmed?'אישור ביקור ללא כרטיס: סומן כבוצע על ידי ההורה (דיווח עצמי)\n':''}הורה: ${body.parentName}\nטלפון: ${phone}\n\n${body.message}\n\nאסמכתא: ${body.requestId}`,
        start:{date:day},end:{date:nextDay(day)},visibility:'private',transparency:'transparent',
        reminders:{useDefault:false},
        extendedProperties:{private:{doctorRequest:body.requestId,fingerprint,clinic:body.clinic}},
      }},{timeout:10000})).data;
    } catch {
      // A timeout may follow a successful insert. Reconcile the same ID; never duplicate it.
      try { event = (await calendar.events.get({calendarId:target,eventId},{timeout:10000})).data; }
      catch { throw new BookingError('processing'); }
    }
  }
  if (event?.status==='cancelled') throw new BookingError('request_closed',409);
  if (event?.id!==eventId || event.extendedProperties?.private?.fingerprint!==fingerprint || event.extendedProperties?.private?.doctorRequest!==body.requestId) throw new BookingError('processing');
  return {received:true,reference:body.requestId,calendarDay:day,timeZone:TIME_ZONE};
}
