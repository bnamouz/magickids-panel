// Fixed owner-only test. Never use patient contacts or appointment data here.
export const OWNER_WHATSAPP_TEST = {
  id: 'owner-whatsapp-test:2026-10-16:v1',
  instance: 'instance173060',
  sender: '+972544020043',
  to: '+972509955137',
  body: 'שלום, זו הודעת בדיקה מהדאשבורד של מכון ילדי הקסם לבדיקת חיבור הוואטסאפ של המכון. אין זה אישור לתור אמיתי ואין צורך להגיע למכון.\nתודה, צוות Magic Kids.',
} as const;

export const WHATSAPP_TEST_LABELS: Record<string, string> = {
  loading: 'בודק את החיבור ואת מצב הבדיקה…',
  not_requested: 'טרם התבקשה שליחת בדיקה.',
  pending: 'טרם בוצעה שליחה לספק.',
  sending: 'השליחה בטיפול. אין לשלוח שוב; אפשר לרענן מצב בלבד.',
  accepted: 'UltraMsg קיבל את ההודעה לטיפול. יש לבדוק שהתקבלה בפועל בוואטסאפ של הנמען.',
  unknown: 'תוצאת השליחה אינה ודאית. אין לשלוח שוב לפני בירור.',
  unavailable: 'לא ניתן לבדוק את המצב כרגע. השליחה חסומה.',
  not_configured: 'חסרה הגדרת UltraMsg באתר.',
  identity_mismatch: 'חיבור הוואטסאפ באתר אינו תואם למספר המכון שאושר. השליחה חסומה.',
  identity_unavailable: 'לא ניתן לאמת כעת את מספר הוואטסאפ המחובר. השליחה חסומה.',
  verified: 'מספר המכון אומת מול UltraMsg.',
  forbidden: 'נדרשת כניסה כמנהל המכון.',
  invalid_request: 'נדרש אישור מפורש לנמען ולנוסח הקבועים.',
};
