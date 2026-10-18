import type { BookingLanguage } from './copy';

export const paymentCopy: Record<BookingLanguage, {
  fundTitle: string; fundHint: string; funds: Record<'maccabi' | 'clalit' | 'meuhedet' | 'leumit' | 'private', string>;
  maccabiNote: string; sheli: string; moxoAsk: string; moxoMaccabiNote: string; changeFund: string;
  paidTitle: string; paidIntro: string; priceAssessment: string; priceMoxo: string; vatNote: string; total: string; followupPrice: string; moxoOptional: string;
  methods: string; bank: string; bankAccount: string; beneficiary: string; bit: string; bitTo: string; cardSoon: string; transferNote: string;
  method: string; proof: string; submit: string; sending: string; received: string; receivedText: string; paidReady: string; consent: string; currency: string;
  errors: Record<string, string>;
}> = {
  he: {
    fundTitle: 'לאיזו קופת חולים שייך/ת הילד/ה?', fundHint: 'תהליך האבחון זהה לכל הקופות. הקופה קובעת רק את אופן התשלום.',
    funds: { maccabi: 'מכבי', clalit: 'כללית', meuhedet: 'מאוחדת', leumit: 'לאומית', private: 'פרטי / ללא קופה' },
    maccabiNote: 'מטופלי מכבי: אין תשלום מראש. התשלום מתבצע בהעברת כרטיס מכבי של הילד/ה בעת הביקור במרפאה.',
    sheli: 'יש לילד/ה ביטוח מכבי שלי', moxoAsk: 'מבקשים גם מבדק MOXO (מבדק ממוחשב לקשב)',
    moxoMaccabiNote: 'מבדק MOXO ללא תשלום רק לחברי מכבי שלי. בלי מכבי שלי עלות המבדק 944 ₪ (800 ₪ + מע״מ), והמזכירות תתאם איתכם את התשלום לפני הביקור.',
    changeFund: 'שינוי קופה',
    paidTitle: 'תשלום מראש לפני קביעת התור',
    paidIntro: 'מטופלי כללית, מאוחדת, לאומית ופרטי משלמים לפני הביקור. אחרי התשלום מעלים כאן את האסמכתה. לאחר אימות התשלום נשלח לכם בוואטסאפ קישור אישי לבחירת מועד.',
    priceAssessment: 'אבחון הפרעת קשב וריכוז (1,200 ₪ + מע״מ)', priceMoxo: 'מבדק MOXO (800 ₪ + מע״מ)', vatNote: 'המחירים כוללים מע״מ 18%.', total: 'סה״כ לתשלום',
    followupPrice: 'את סכום ביקור המעקב תמסור לכם המזכירות בוואטסאפ 054-402-0043. אחרי התשלום העלו כאן את האסמכתה.',
    moxoOptional: 'מבדק ממוחשב לקשב — לפי בחירה. סמנו כדי להוסיף.',
    methods: 'אפשרויות תשלום', bank: 'העברה בנקאית', bankAccount: 'חשבון המכון', beneficiary: 'על שם', bit: 'ביט', bitTo: 'למספר', cardSoon: 'תשלום בכרטיס אשראי באתר יתווסף בהמשך.',
    transferNote: 'ציינו בהעברה את שם הילד/ה.',
    method: 'איך שילמתם?', proof: 'אסמכתת התשלום: צילום מסך או PDF, עד 5MB', submit: 'שליחת האסמכתה', sending: 'שולחים…',
    received: 'האסמכתה התקבלה', receivedText: 'נבדוק את התשלום ונשלח לכם בוואטסאפ קישור אישי לבחירת מועד. אין צורך לשלוח שוב.',
    paidReady: 'התשלום אושר. אפשר לבחור מועד לביקור.',
    consent: 'אני ההורה או האפוטרופוס, ומאשר/ת שמירת הפרטים והאסמכתה לצורך אימות התשלום וקביעת התור.', currency: '₪',
    errors: {
      invalid_proof: 'צרפו צילום או PDF של אסמכתת התשלום (JPG, PNG או PDF, עד 5MB).', too_large: 'הקובץ גדול מדי. אפשר לצרף עד 5MB.',
      payment_required: 'מטופלי קופות שאינן מכבי משלמים מראש ומעלים אסמכתה לפני קביעת התור.', invalid_payment: 'הקישור האישי לקביעת התור אינו תקין. פנו למזכירות.',
      payment_used: 'כבר נקבע תור בקישור הזה. לשינוי פנו למזכירות.', fund_required: 'בחרו קופת חולים.',
    },
  },
  ar: {
    fundTitle: 'لأي صندوق مرضى ينتمي الطفل/ة؟', fundHint: 'مسار التشخيص نفسه لجميع الصناديق. الصندوق يحدد طريقة الدفع فقط.',
    funds: { maccabi: 'مكابي', clalit: 'كلاليت', meuhedet: 'مئوحيدت', leumit: 'لئوميت', private: 'خاص / بدون صندوق' },
    maccabiNote: 'لمؤمَّني مكابي: لا يوجد دفع مسبق. يتم الدفع بتمرير بطاقة مكابي الخاصة بالطفل/ة عند الزيارة في العيادة.',
    sheli: 'لدى الطفل/ة تأمين مكابي شيلي', moxoAsk: 'نطلب أيضًا فحص MOXO (فحص محوسب للانتباه)',
    moxoMaccabiNote: 'فحص MOXO مجاني فقط لأعضاء مكابي شيلي. بدون مكابي شيلي تكلفة الفحص 944 ₪ (800 ₪ + ضريبة القيمة المضافة)، وستنسّق معكم السكرتارية الدفع قبل الزيارة.',
    changeFund: 'تغيير الصندوق',
    paidTitle: 'الدفع المسبق قبل تحديد الموعد',
    paidIntro: 'مؤمَّنو كلاليت ومئوحيدت ولئوميت والخاص يدفعون قبل الزيارة. بعد الدفع ارفعوا هنا إثبات الدفع. بعد التحقق من الدفع نرسل لكم عبر واتساب رابطًا شخصيًا لاختيار الموعد.',
    priceAssessment: 'تشخيص اضطراب الانتباه والتركيز (1,200 ₪ + ضريبة)', priceMoxo: 'فحص MOXO (800 ₪ + ضريبة)', vatNote: 'الأسعار تشمل ضريبة القيمة المضافة 18%.', total: 'المجموع للدفع',
    followupPrice: 'ستبلغكم السكرتارية بمبلغ زيارة المتابعة عبر واتساب 054-402-0043. بعد الدفع ارفعوا إثبات الدفع هنا.',
    moxoOptional: 'فحص محوسب للانتباه — اختياري. علّموا للإضافة.',
    methods: 'طرق الدفع', bank: 'تحويل بنكي', bankAccount: 'حساب المعهد', beneficiary: 'باسم', bit: 'Bit (بيت)', bitTo: 'إلى الرقم', cardSoon: 'الدفع ببطاقة الائتمان عبر الموقع سيُضاف لاحقًا.',
    transferNote: 'اذكروا اسم الطفل/ة في التحويل.',
    method: 'كيف دفعتم؟', proof: 'إثبات الدفع: لقطة شاشة أو PDF، حتى 5MB', submit: 'إرسال إثبات الدفع', sending: 'جارٍ الإرسال…',
    received: 'تم استلام إثبات الدفع', receivedText: 'سنتحقق من الدفع ونرسل لكم عبر واتساب رابطًا شخصيًا لاختيار الموعد. لا حاجة للإرسال مرة أخرى.',
    paidReady: 'تم تأكيد الدفع. يمكنكم اختيار موعد الزيارة.',
    consent: 'أنا الوالد/ة أو الوصي، وأوافق على حفظ التفاصيل وإثبات الدفع لغرض التحقق من الدفع وتحديد الموعد.', currency: '₪',
    errors: {
      invalid_proof: 'أرفقوا صورة أو PDF لإثبات الدفع (JPG أو PNG أو PDF حتى 5MB).', too_large: 'الملف كبير جدًا. الحد الأقصى 5MB.',
      payment_required: 'مؤمَّنو الصناديق غير مكابي يدفعون مسبقًا ويرفعون إثبات الدفع قبل تحديد الموعد.', invalid_payment: 'الرابط الشخصي لتحديد الموعد غير صالح. تواصلوا مع السكرتارية.',
      payment_used: 'تم تحديد موعد بهذا الرابط. للتغيير تواصلوا مع السكرتارية.', fund_required: 'اختاروا صندوق المرضى.',
    },
  },
  en: {
    fundTitle: "Which health fund is the child insured with?", fundHint: 'The assessment process is the same for every fund. The fund only determines how you pay.',
    funds: { maccabi: 'Maccabi', clalit: 'Clalit', meuhedet: 'Meuhedet', leumit: 'Leumit', private: 'Private / no fund' },
    maccabiNote: "Maccabi patients: no advance payment. Payment is made by swiping the child's Maccabi card at the clinic visit.",
    sheli: 'The child has Maccabi Sheli', moxoAsk: 'We also want a MOXO test (computerized attention test)',
    moxoMaccabiNote: 'The MOXO test is free only for Maccabi Sheli members. Without Maccabi Sheli the test costs ₪944 (₪800 + VAT), and the secretary will arrange payment with you before the visit.',
    changeFund: 'Change fund',
    paidTitle: 'Advance payment before booking',
    paidIntro: 'Clalit, Meuhedet, Leumit and private patients pay before the visit. After paying, upload the payment confirmation here. Once the payment is verified we will send you a personal WhatsApp link to choose a time.',
    priceAssessment: 'ADHD assessment (₪1,200 + VAT)', priceMoxo: 'MOXO test (₪800 + VAT)', vatNote: 'Prices include 18% VAT.', total: 'Total to pay',
    followupPrice: 'The secretary will tell you the follow-up fee on WhatsApp at 054-402-0043. After paying, upload the confirmation here.',
    moxoOptional: 'Computerized attention test — optional. Tick to add.',
    methods: 'Payment options', bank: 'Bank transfer', bankAccount: 'Institute account', beneficiary: 'Account name', bit: 'Bit', bitTo: 'To', cardSoon: 'Credit card payment on the website will be added later.',
    transferNote: "Write the child's name in the transfer.",
    method: 'How did you pay?', proof: 'Payment confirmation: screenshot or PDF, up to 5MB', submit: 'Send confirmation', sending: 'Sending…',
    received: 'Confirmation received', receivedText: 'We will verify the payment and send you a personal WhatsApp link to choose a time. No need to send it again.',
    paidReady: 'Payment approved. You can now choose a time.',
    consent: 'I am the parent or guardian and agree to the storage of these details and the confirmation for payment verification and booking.', currency: '₪',
    errors: {
      invalid_proof: 'Attach a screenshot or PDF of the payment confirmation (JPG, PNG or PDF, up to 5MB).', too_large: 'The file is too large (max 5MB).',
      payment_required: 'Patients outside Maccabi pay in advance and upload a confirmation before booking.', invalid_payment: 'The personal booking link is not valid. Please contact the secretary.',
      payment_used: 'A visit was already booked with this link. Contact the secretary to change it.', fund_required: 'Choose a health fund.',
    },
  },
};
