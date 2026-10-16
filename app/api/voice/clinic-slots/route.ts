import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertVoiceAuth } from '@/lib/voice-auth';
import { getSlots, BookingError } from '@/lib/booking/server';
import { localParts, TIME_ZONE } from '@/lib/booking/schedule';

/**
 * POST /api/voice/clinic-slots
 * Real free pediatrics-clinic slots (10 min), from the same engine as the website.
 * Optional filters: a date (YYYY-MM-DD) or a part of day. Returns at most `limit` slots.
 */
export const runtime = 'nodejs';
export const maxDuration = 30;

const Schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  part_of_day: z.enum(['morning', 'afternoon', 'evening', 'any']).optional().or(z.literal('')),
  language: z.enum(['he', 'ar']).optional().or(z.literal('')),
  limit: z.number().int().min(1).max(8).optional(),
});

const HOURS_TEXT = {
  he: 'ראשון סגור · שני 10:00–15:30 · שלישי 16:00–20:00 · רביעי 10:00–13:30 · חמישי 17:00–20:00 · שישי ושבת 09:30–12:30',
  ar: 'الأحد مسكّر · الاثنين 10:00–15:30 · الثلاثاء 16:00–20:00 · الأربعاء 10:00–13:30 · الخميس 17:00–20:00 · الجمعة والسبت 09:30–12:30',
};

function part(minutes: number) { return minutes < 720 ? 'morning' : minutes < 960 ? 'afternoon' : 'evening'; }

export async function POST(req: NextRequest) {
  const unauth = assertVoiceAuth(req);
  if (unauth) return unauth;
  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
  const { date, part_of_day, limit = 4 } = parsed.data;
  const lang = parsed.data.language === 'he' ? 'he' : 'ar';
  try {
    const all = await getSlots('pediatrics');
    const filtered = all.filter((iso) => {
      const p = localParts(new Date(iso));
      if (date && p.date !== date) return false;
      if (part_of_day && part_of_day !== 'any' && part(p.minutes) !== part_of_day) return false;
      return true;
    });
    // Spread suggestions across days instead of six consecutive 10-minute slots.
    const picked: string[] = [];
    const perDay = new Map<string, number>();
    for (const iso of filtered) {
      const d = localParts(new Date(iso)).date;
      if ((perDay.get(d) ?? 0) >= (date ? limit : 2)) continue;
      perDay.set(d, (perDay.get(d) ?? 0) + 1);
      picked.push(iso);
      if (picked.length >= limit) break;
    }
    const fmt = new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'ar-IL', {
      timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false, numberingSystem: 'latn',
    });
    return NextResponse.json({
      success: true,
      clinic_hours: HOURS_TEXT[lang],
      slots: picked.map((iso) => ({ scheduled_at: iso, label: fmt.format(new Date(iso)) })),
      total_free_matching: filtered.length,
      instruction: picked.length
        ? 'Offer 2-3 of these slots. Book only one the caller explicitly confirms, passing its scheduled_at unchanged.'
        : 'No free slot matches. Offer another day or part of day, or call again without filters.',
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof BookingError ? error.code : 'unavailable' }, { status: 503 });
  }
}
