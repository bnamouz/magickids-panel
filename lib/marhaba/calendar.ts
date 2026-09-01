// lib/marhaba/calendar.ts
// Static weekly demo slot template for Baseem's Marhaba sales demos.
// Avoids Wed 16-20 (ADHD assessment time in magickids-panel).

export type DemoSlot = {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm (24h)
  iso: string;  // ISO with Israel offset (informational)
  hebrew_label: string;
};

// Slots per weekday (0=Sunday ... 6=Saturday)
const WEEKLY_TEMPLATE: Record<number, string[]> = {
  0: ['11:00', '14:00', '17:00'], // Sunday
  1: ['11:00', '14:00', '17:00'], // Monday
  2: ['11:00', '14:00', '17:00'], // Tuesday
  3: ['11:00', '14:00'],           // Wednesday (avoid 16-20 = clinic)
  4: ['11:00', '17:00'],           // Thursday
  5: ['09:00', '10:00'],           // Friday (short day)
  6: [],                            // Saturday — closed
};

const DAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/** Return the next N business demo slots starting from `startDate` (default today). */
export function getUpcomingDemoSlots(daysAhead: number = 7, startDate?: Date): DemoSlot[] {
  const start = startDate ? new Date(startDate) : new Date();
  const slots: DemoSlot[] = [];
  const now = new Date();

  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    const times = WEEKLY_TEMPLATE[dow] || [];
    for (const t of times) {
      const [hh, mm] = t.split(':').map(Number);
      const slot = new Date(d);
      slot.setHours(hh, mm, 0, 0);
      // Skip past slots for today
      if (slot < now) continue;

      const yyyy = slot.getFullYear();
      const mo = String(slot.getMonth() + 1).padStart(2, '0');
      const dd = String(slot.getDate()).padStart(2, '0');
      slots.push({
        date: `${yyyy}-${mo}-${dd}`,
        time: t,
        iso: slot.toISOString(),
        hebrew_label: `יום ${DAY_NAMES_HE[dow]} ${dd}/${mo} בשעה ${t}`,
      });
    }
  }
  return slots;
}

/** Format an ISO datetime string in Hebrew, Asia/Jerusalem timezone. */
export function formatHebrewDatetime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Combine date + time into an ISO string in Israel time. */
export function buildDemoIso(date: string, time: string): string {
  // date=YYYY-MM-DD, time=HH:mm  →  YYYY-MM-DDTHH:mm:00+03:00 (rough IDT)
  return `${date}T${time}:00+03:00`;
}
