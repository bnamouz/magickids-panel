/**
 * Fixed links Sarah may send. The agent picks a key; it can never send a free-form URL.
 */
export const VOICE_LINKS = {
  app_home: { url: 'https://app.magickidsinstitute.com/', he: 'האפליקציה של מכון ילדי הקסם', ar: 'تطبيق معهد أطفال السحر' },
  adhd_registration: { url: 'https://app.magickidsinstitute.com/onboarding/public', he: 'פתיחת תיק ושאלונים לאבחון קשב וריכוז', ar: 'فتح ملف واستمارات تشخيص ADHD' },
  pediatrics_booking: { url: 'https://app.magickidsinstitute.com/book/pediatrics', he: 'קביעת תור במרפאת הילדים', ar: 'حجز دور في عيادة الأطفال' },
  moxo: { url: 'https://app.magickidsinstitute.com/moxo', he: 'בקשה לבדיקת MOXO', ar: 'طلب فحص MOXO' },
  treatments: { url: 'https://app.magickidsinstitute.com/treatments', he: 'פנייה לטיפולים', ar: 'طلب علاج' },
  development: { url: 'https://app.magickidsinstitute.com/development', he: 'הערכת התפתחות הילד', ar: 'تقييم تطور الطفل' },
  classes: { url: 'https://app.magickidsinstitute.com/classes', he: 'חוגים במכון', ar: 'دورات وحلقات في المعهد' },
  website: { url: 'https://www.magickidsinstitute.com/', he: 'אתר המכון', ar: 'موقع المعهد' },
  workshops: { url: 'https://magickidsinstitute.com/workshop-register.html', he: 'הרשמה לסדנאות הורים', ar: 'التسجيل لورشات الأهل' },
  private_care: { url: 'https://magickidsinstitute.com/private-care.html', he: 'רפואה פרטית', ar: 'طب خاص' },
} as const;

export type VoiceLinkKey = keyof typeof VOICE_LINKS;
export const VOICE_LINK_KEYS = Object.keys(VOICE_LINKS) as [VoiceLinkKey, ...VoiceLinkKey[]];

/** Every link message Sarah sends ends with the institute website (owner request, 24.10.2026). */
export function instituteWebsiteLines(lang: 'he' | 'ar') {
  return [`${VOICE_LINKS.website[lang]}:`, voiceLinkUrl('website', lang), ''];
}

export function voiceLinkUrl(key: VoiceLinkKey, lang: 'he' | 'ar') {
  const u = new URL(VOICE_LINKS[key].url);
  u.searchParams.set('lang', lang);
  u.searchParams.set('utm_source', 'voice');
  u.searchParams.set('utm_medium', 'whatsapp');
  return u.toString();
}
