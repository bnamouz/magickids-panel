export function requestBookingToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');}
export function requestBookingId(){const a=crypto.getRandomValues(new Uint8Array(16));a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;const h=Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
export const bookingTime=(s:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(s));
export const bookingDate=(s:string)=>new Intl.DateTimeFormat('he-IL-u-nu-latn',{timeZone:'Asia/Jerusalem',weekday:'long',day:'numeric',month:'long'}).format(new Date(s));
export const statusLabel:Record<string,string>={pending:'ממתינה לאישור רנא',syncing:'האישור ממתין להשלמת הרישום ביומן',confirmed:'התור אושר ונרשם ביומן',rejected:'הבקשה נדחתה',expired:'תוקף הבקשה הסתיים',cancelling:'הביטול ממתין להשלמה ביומן',cancelled:'התור בוטל'};
export const bookingMessages:Record<string,string>={
 confirm_parent:'יש לאשר שהמועד תואם עם ההורה לפני קביעת התור.',
 unavailable:'השירות אינו זמין כרגע. נסו שוב או פנו למכון.',
 calendar_unavailable:'לא ניתן לאמת את הזמינות ביומן Google כרגע. לא תתאפשר בחירת תור עד שהחיבור יחזור.',
 slot_taken:'השעה כבר אינה פנויה או אינה מתאימה לשעות העבודה. רעננו ובחרו שעה אחרת.',
 invalid_slot:'המועד אינו מתאים לשעות העבודה או קרוב מדי. יש לבחור מועד חדש.',
 invalid_request:'בדקו שהשמות והטלפון הנייד תקינים ושאישרתם את תנאי הבקשה.',
 invalid_retry:'הבקשה כבר נשמרה עם פרטים אחרים. השתמשו בקישור המעקב המקורי.',
 rate_limited:'נשלחו בקשות רבות בזמן קצר. נסו שוב מאוחר יותר או פנו למכון.',
 forbidden:'הקישור אינו תקין, אינו מורשה או פג תוקף. בקשו מצוות המכון קישור אישי חדש.',
 not_found:'לא נמצאה בקשה עבור קישור המעקב הזה.',
 sync_pending:'הרישום ביומן טרם הושלם. השעה נשארת שמורה, אך אין אישור סופי. נסו להשלים את הסנכרון שוב.',
 event_mismatch:'נמצא שינוי באירוע היומן. אין אישור חדש; פנו לצוות המכון לבדיקה לפני ניסיון נוסף.',
 busy:'הבקשה בטיפול כעת. המתינו עד 3 דקות ורעננו לפני ניסיון נוסף.',
 expired:'תוקף הבקשה פג. ההורה יכול לשלוח בקשה חדשה.',
 invalid_state:'לא ניתן לבצע פעולה זו במצב הנוכחי. רעננו את הבקשה.',
 cannot_reject:'הבקשה כבר בתהליך אישור או טופלה. השתמשו בביטול תור במקום בדחיית בקשה.',
 invalid_availability:'השעות אינן תקינות. ודאו שאין חפיפות, ושכל טווח מתחלק במלואו במשך הטיפול.',
 stale_settings:'הזמינות השתנתה בחלון אחר. רעננו לפני שמירה נוספת.',
};
