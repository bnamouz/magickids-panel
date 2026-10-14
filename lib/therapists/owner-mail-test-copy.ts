// One owner-approved test. Never accept destination, subject, body or ID from a request.
export const OWNER_MAIL_TEST = {
  id: 'owner-mail-test:2026-10-15:v1',
  sender: 'magickids@magickidsinstitute.com',
  to: 'bnamouz@gmail.com',
  subject: 'Magic Kids | בדיקת הודעת אישור תור',
  body: 'שלום, זו הודעת בדיקה ממערכת זימון התורים של מכון ילדי הקסם. ההודעה נועדה לבדוק את שליחת המייל בלבד. אין זה אישור לתור אמיתי ואין צורך להגיע למכון.\nתודה, צוות Magic Kids.',
} as const;

export const MAIL_TEST_LABELS: Record<string, string> = {
  not_requested: 'הבדיקה טרם נשלחה.',
  pending: 'הבקשה ממתינה לביצוע.',
  sending: 'הבקשה בטיפול. יש לרענן מצב, לא לשלוח מחדש.',
  accepted: 'Google קיבל את ההודעה לשליחה. יש לבדוק בתיבת הדואר וגם בספאם; קבלה בפועל טרם אושרה.',
  unknown: 'לא ניתן לאמת את תוצאת השליחה. אין לשלוח שוב עד לבדיקת המצב.',
  not_configured: 'חיבור המייל בשרת אינו מוגדר. לא נשלחה הודעה.',
  unavailable: 'לא ניתן לבדוק או לשמור את מצב השליחה כרגע. יש לרענן מצב לפני פעולה נוספת.',
  forbidden: 'הפעולה זמינה למנהל מחובר בלבד.',
  invalid_request: 'בקשת הבדיקה אינה תקינה. יש לרענן את העמוד.',
};
