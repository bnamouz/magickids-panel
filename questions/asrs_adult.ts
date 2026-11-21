/**
 * Adult ADHD self-report (ages 18+), filled in by the person being assessed.
 *
 * Part A (items 1–6) is the WHO ASRS-v1.1 6-question screener, reproduced unaltered from the official
 * English, Hebrew and Arabic versions published at https://www.hcp.med.harvard.edu/ncs/asrs.php
 *   Kessler RC, Adler L, Ames M, et al. (2005). The World Health Organization Adult ADHD Self-Report Scale (ASRS).
 *   Psychological Medicine, 35(2), 245–256.
 *   Copyright © New York University and President and Fellows of Harvard College. All rights reserved.
 * The screener is free to use; its wording, response options and scoring must not be changed.
 *
 * Part B (items 7–18) is the institute's own supplement, written for this clinic. It asks about the twelve DSM-5
 * symptoms the screener does not cover, in the same frequency format. It is NOT the ASRS 18-question checklist
 * (which needs a licence) and it is not a validated scale: it gives the physician a per-symptom starting point.
 *
 * Items 19–22 ask about childhood (DSM-5 criterion B), items 23–28 about current impairment (criteria C–D).
 */
export type AdultLang = 'he' | 'ar' | 'en';
type L = Record<AdultLang, string>;
export type AdultDomain = 'inattention' | 'hyperactivity';
export type AdultPart = 'A' | 'B' | 'childhood' | 'impairment';
export interface AdultQuestion { id: number; part: AdultPart; text: L; dsm?: string; domain?: AdultDomain; max: number }

const s = (id: number, part: 'A' | 'B', dsm: string, he: string, ar: string, en: string): AdultQuestion =>
  ({ id, part, dsm, domain: dsm.startsWith('A1') ? 'inattention' : 'hyperactivity', max: 4, text: { he, ar, en } });
const c = (id: number, he: string, ar: string, en: string): AdultQuestion => ({ id, part: 'childhood', max: 3, text: { he, ar, en } });
const f = (id: number, he: string, ar: string, en: string): AdultQuestion => ({ id, part: 'impairment', max: 3, text: { he, ar, en } });

export const ASRS_ADULT_QUESTIONS: AdultQuestion[] = [
  // Part A – official ASRS-v1.1 screener wording. Do not edit.
  s(1, 'A', 'A1d', 'האם קשה לך להשלים את הפרטים הקטנים של פרויקט, לאחר שסיימת את החלקים המאתגרים?',
    'الى اى مدى تواجه مشكلة فى اختتام التفاصيل النهائية لمشروع ، بمجرد انجاز أجزاءه الصعبة؟',
    'How often do you have trouble wrapping up the final details of a project, once the challenging parts have been done?'),
  s(2, 'A', 'A1e', 'באיזו תכיפות את/ה מתקשה ליצור סדר בדברים, כאשר את/ה מבצע/ת משימה המצריכה ארגון?',
    'الى اى مدى لديك صعوبة فى ترتيب الاشياء عندما يكون عليك مهمة تتطلب تنظيم ؟',
    'How often do you have difficulty getting things in order when you have to do a task that requires organization?'),
  s(3, 'A', 'A1i', 'באיזו תכיפות את/ה מתקשה לזכור פגישות או התחייבויות?',
    'الى اى مدى لديك مشكلة فى تذكر المواعيد أو الالتزامات ؟',
    'How often do you have problems remembering appointments or obligations?'),
  s(4, 'A', 'A1f', 'כאשר מוטלת עלייך משימה המצריכה חשיבה מרובה, באיזו תכיפות את/ה נמנע/ת או דוחה את התחלתה?',
    'عندما يكون لديك مهمة تتطلب الكثير من التفكير ، الى أى مدى تتجنب أو تأخر البدء فيها؟',
    'When you have a task that requires a lot of thought, how often do you avoid or delay getting started?'),
  s(5, 'A', 'A2a', 'באיזו תכיפות את/ה מתפתל/ת או מניע/ה בקוצר-רוח את ידייך או רגלייך, כאשר עליך לשבת במקומך למשך זמן ארוך?',
    'الى أى مدى ما تتململ أوتفرك بيدك أوقدميك عندما يكون عليك الجلوس لفترة طويلة ؟',
    'How often do you fidget or squirm with your hands or feet when you have to sit down for a long time?'),
  s(6, 'A', 'A2e', 'באיזו תכיפות את/ה מרגיש/ה פעיל/ה יתר על המידה או מרגיש/ה צורך לעשות דברים, כאילו את/ה מופעל/ת על-ידי מנוע?',
    'الى اى مدى تشعر بنشاط مفرط وانك مضطر أن تفعل أشياء ، كما لو كنت مدفوع بواسطة محرك ؟',
    'How often do you feel overly active and compelled to do things, like you were driven by a motor?'),

  // Part B – institute supplement (own wording).
  s(7, 'B', 'A1a', 'באיזו תכיפות נופלות אצלך טעויות של חוסר תשומת לב בעבודה, בלימודים, בטפסים או במסמכים?',
    'كم مرة تقع في أخطاء ناتجة عن قلة الانتباه في العمل أو الدراسة أو عند تعبئة النماذج والمستندات؟',
    'How often do you make inattentive mistakes at work, in your studies, or when filling in forms and documents?'),
  s(8, 'B', 'A1b', 'באיזו תכיפות קשה לך להישאר מרוכז/ת לאורך זמן, למשל בקריאה, בישיבת עבודה, בהרצאה או בשיחה ארוכה?',
    'كم مرة تجد صعوبة في البقاء مركّزاً لفترة طويلة، مثلاً أثناء القراءة أو في اجتماع أو محاضرة أو حديث طويل؟',
    'How often do you find it hard to stay focused for long, for example while reading, in a meeting, in a lecture or in a long conversation?'),
  s(9, 'B', 'A1c', 'באיזו תכיפות אומרים לך שנראה שאינך מקשיב/ה, או שאת/ה מגלה שמחשבותיך נדדו בזמן שמדברים אליך?',
    'كم مرة يُقال لك إنك تبدو غير مصغٍ، أو تلاحظ أن أفكارك شردت بينما يتحدث أحد إليك؟',
    'How often are you told that you do not seem to be listening, or do you notice your mind has wandered while someone is talking to you?'),
  s(10, 'B', 'A1g', 'באיזו תכיפות את/ה מאבד/ת או לא מוצא/ת חפצים נחוצים, כמו מפתחות, ארנק, טלפון או מסמכים?',
    'كم مرة تفقد أو لا تجد أغراضاً تحتاجها، مثل المفاتيح أو المحفظة أو الهاتف أو المستندات؟',
    'How often do you lose or fail to find things you need, such as keys, wallet, phone or documents?'),
  s(11, 'B', 'A1h', 'באיזו תכיפות רעשים, הודעות בטלפון או מחשבות שאינן קשורות מסיחים את דעתך ממה שאת/ה עושה?',
    'كم مرة تشتّت انتباهك الضوضاء أو إشعارات الهاتف أو أفكار لا علاقة لها بما تقوم به؟',
    'How often do noises, phone notifications or unrelated thoughts pull you away from what you are doing?'),
  s(12, 'B', 'A2b', 'באיזו תכיפות את/ה קם/ה ממקומך במצבים שבהם מצופה להישאר לשבת, כמו ישיבה, שיעור או ארוחה?',
    'كم مرة تقوم من مكانك في مواقف يُتوقع فيها أن تبقى جالساً، مثل اجتماع أو درس أو وجبة طعام؟',
    'How often do you get up from your seat in situations where you are expected to stay seated, such as a meeting, a class or a meal?'),
  s(13, 'B', 'A2c', 'באיזו תכיפות את/ה חש/ה אי-שקט פנימי, תחושה שקשה לך להישאר במנוחה?',
    'كم مرة تشعر بتململ داخلي، إحساس بأنه من الصعب عليك أن تبقى هادئاً؟',
    'How often do you feel restless inside, a sense that it is hard for you to stay at rest?'),
  s(14, 'B', 'A2d', 'באיזו תכיפות קשה לך לעסוק בשקט ובנחת בפעילות פנאי, או פשוט לנוח בזמן הפנוי?',
    'كم مرة تجد صعوبة في ممارسة نشاط ترفيهي بهدوء، أو في الاستراحة ببساطة في وقت الفراغ؟',
    'How often do you find it hard to do a leisure activity quietly, or simply to rest in your free time?'),
  s(15, 'B', 'A2f', 'באיזו תכיפות את/ה מדבר/ת יותר מדי, או שמעירים לך על כך?',
    'كم مرة تتكلم أكثر من اللازم، أو يلفت الآخرون نظرك إلى ذلك؟',
    'How often do you talk too much, or do others point this out to you?'),
  s(16, 'B', 'A2g', 'באיזו תכיפות את/ה עונה לפני שהשאלה הסתיימה, או משלים/ה משפטים של אחרים?',
    'كم مرة تجيب قبل أن ينتهي السؤال، أو تُكمل جمل الآخرين؟',
    'How often do you answer before the question is finished, or complete other people’s sentences?'),
  s(17, 'B', 'A2h', 'באיזו תכיפות קשה לך לחכות לתורך, למשל בתור, בפקק תנועה או בשיחה?',
    'كم مرة تجد صعوبة في انتظار دورك، مثلاً في طابور أو في أزمة سير أو أثناء حديث؟',
    'How often do you find it hard to wait your turn, for example in a queue, in traffic or in a conversation?'),
  s(18, 'B', 'A2i', 'באיזו תכיפות את/ה נכנס/ת לדברי אחרים או מתערב/ת במה שהם עושים, גם כשהם עסוקים?',
    'كم مرة تقاطع كلام الآخرين أو تتدخل في ما يفعلونه، حتى عندما يكونون مشغولين؟',
    'How often do you cut into what others are saying or step into what they are doing, even when they are busy?'),

  // Childhood, before age 12.
  c(19, 'לפני גיל 12 התקשיתי להתרכז בשיעורים, בהכנת שיעורי בית או במשימות ממושכות.',
    'قبل سن 12 كنت أجد صعوبة في التركيز في الدروس أو في حلّ الوظائف البيتية أو في المهام الطويلة.',
    'Before age 12 I found it hard to concentrate in class, on homework or on long tasks.'),
  c(20, 'לפני גיל 12 הייתי חסר/ת מנוחה, התקשיתי לשבת במקום או פעלתי בלי לחשוב.',
    'قبل سن 12 كنت كثير الحركة، أجد صعوبة في الجلوس في مكاني أو أتصرف دون تفكير.',
    'Before age 12 I was restless, found it hard to sit still or acted without thinking.'),
  c(21, 'מורים או הורים העירו לי בילדות על חוסר ריכוז, חלמנות, פטפוט או חוסר שקט.',
    'كان المعلمون أو الأهل يلفتون نظري في طفولتي إلى قلة التركيز أو الشرود أو كثرة الكلام أو قلة الهدوء.',
    'As a child, teachers or parents commented on my poor concentration, daydreaming, chattering or restlessness.'),
  c(22, 'הקשיים האלה פגעו בילדות בהישגים בלימודים או ביחסים עם ילדים אחרים או עם המשפחה.',
    'هذه الصعوبات أثّرت في طفولتي على تحصيلي الدراسي أو على علاقاتي مع الأولاد الآخرين أو مع العائلة.',
    'In childhood these difficulties affected my school results or my relationships with other children or with my family.'),

  // Current impairment, past 6 months.
  f(23, 'עבודה או לימודים', 'العمل أو الدراسة', 'Work or studies'),
  f(24, 'ניהול הבית, סידורים, חשבונות וכספים', 'إدارة البيت، المعاملات، الفواتير والأمور المالية', 'Running the home, errands, bills and money'),
  f(25, 'זוגיות וחיי משפחה', 'العلاقة الزوجية والحياة العائلية', 'Partner and family life'),
  f(26, 'קשרים חברתיים', 'العلاقات الاجتماعية', 'Friendships and social life'),
  f(27, 'נהיגה ובטיחות (מי שאינו/ה נוהג/ת: "כלל לא")', 'القيادة والسلامة (من لا يقود: "إطلاقاً")', 'Driving and safety (if you do not drive: “Not at all”)'),
  f(28, 'הרגשה כללית ודימוי עצמי', 'الشعور العام وصورة الذات', 'General well-being and self-image'),
];

const opts = (he: string, ar: string, en: string) => {
  const [h, a, e] = [he, ar, en].map(v => v.split('|'));
  return h.map((_, value) => ({ value, label: { he: h[value], ar: a[value], en: e[value] } as L }));
};
/** Official ASRS response options, 0–4. */
export const ADULT_SCALE_FREQUENCY = opts('אף פעם לא|לעיתים רחוקות|לפעמים|לעיתים תכופות|לעיתים תכופות מאוד', 'ابدا|نادرا|احيانا|كثيرا|كثيرا جدا', 'Never|Rarely|Sometimes|Often|Very Often');
/** Childhood statements: 3 = does not remember (never counted as a symptom). */
export const ADULT_SCALE_CHILDHOOD = opts('לא נכון|נכון במידה מסוימת|נכון מאוד|לא זוכר/ת', 'غير صحيح|صحيح إلى حدّ ما|صحيح جداً|لا أتذكر', 'Not true|Somewhat true|Very true|I do not remember');
export const ADULT_SCALE_IMPAIRMENT = opts('כלל לא|במידה מועטה|במידה בינונית|במידה רבה', 'إطلاقاً|بدرجة قليلة|بدرجة متوسطة|بدرجة كبيرة', 'Not at all|A little|Moderately|A great deal');
export const adultScale = (part: AdultPart) => part === 'childhood' ? ADULT_SCALE_CHILDHOOD : part === 'impairment' ? ADULT_SCALE_IMPAIRMENT : ADULT_SCALE_FREQUENCY;

export const ASRS_COPYRIGHT = 'ASRS-v1.1 Screener. Kessler RC, Adler L, Ames M, et al. (2005). The World Health Organization Adult ADHD Self-Report Scale (ASRS). Psychological Medicine, 35(2), 245–256. Copyright © New York University and President and Fellows of Harvard College. All rights reserved.';

export interface AdultIntroField { id: string; label: L; type: 'radio' | 'text' | 'textarea'; required?: boolean; options?: { value: string; label: L }[] }
const o = (value: string, he: string, ar: string, en: string) => ({ value, label: { he, ar, en } });
export const ASRS_ADULT_INTRO_FIELDS: AdultIntroField[] = [
  { id: 'main_difficulty', type: 'textarea', required: true, label: { he: 'מה הביא אותך לפנות לאבחון כעת? תאר/י בקצרה את הקושי העיקרי.', ar: 'ما الذي دفعك للتوجه للتقييم الآن؟ صِف باختصار الصعوبة الأساسية.', en: 'What brings you to an assessment now? Briefly describe the main difficulty.' } },
  { id: 'occupation_status', type: 'radio', required: true, label: { he: 'עיסוק נוכחי', ar: 'الوضع الحالي', en: 'Current occupation' }, options: [
    o('employee', 'שכיר/ה', 'موظف/ة', 'Employee'), o('self_employed', 'עצמאי/ת', 'مستقل/ة', 'Self-employed'), o('student', 'סטודנט/ית', 'طالب/ة', 'Student'),
    o('service', 'שירות צבאי / לאומי', 'خدمة عسكرية / مدنية', 'Military / national service'), o('not_working', 'לא עובד/ת כרגע', 'لا أعمل حالياً', 'Not working now'), o('other', 'אחר', 'آخر', 'Other')] },
  { id: 'occupation', type: 'text', label: { he: 'תחום העבודה או הלימודים (אופציונלי)', ar: 'مجال العمل أو الدراسة (اختياري)', en: 'Field of work or study (optional)' } },
  { id: 'prior_adhd', type: 'radio', required: true, label: { he: 'האם אובחנת בעבר בהפרעת קשב וריכוז?', ar: 'هل شُخّصت سابقاً باضطراب الانتباه والتركيز؟', en: 'Have you been diagnosed with ADHD before?' }, options: [
    o('no', 'לא', 'لا', 'No'), o('childhood', 'כן, בילדות', 'نعم، في الطفولة', 'Yes, in childhood'), o('adulthood', 'כן, בבגרות', 'نعم، في سن الرشد', 'Yes, as an adult')] },
  { id: 'adhd_medication', type: 'radio', required: true, label: { he: 'טיפול תרופתי להפרעת קשב (למשל ריטלין, קונצרטה, אטנט, ויואנס)', ar: 'علاج دوائي لاضطراب الانتباه (مثل ريتالين، كونسيرتا، أتنت، فيفانس)', en: 'ADHD medication (e.g. Ritalin, Concerta, Attent, Vyvanse)' }, options: [
    o('never', 'לא נטלתי אף פעם', 'لم أتناول أبداً', 'Never taken'), o('past', 'נטלתי בעבר', 'تناولت في السابق', 'Taken in the past'), o('current', 'נוטל/ת כיום', 'أتناول حالياً', 'Taking now')] },
  { id: 'family_adhd', type: 'radio', required: true, label: { he: 'האם יש קרוב משפחה מדרגה ראשונה עם הפרעת קשב וריכוז?', ar: 'هل يوجد قريب من الدرجة الأولى لديه اضطراب الانتباه والتركيز؟', en: 'Does a first-degree relative have ADHD?' }, options: [
    o('yes', 'כן', 'نعم', 'Yes'), o('no', 'לא', 'لا', 'No'), o('unknown', 'לא ידוע', 'غير معروف', 'Not known')] },
  { id: 'health', type: 'textarea', label: { he: 'מחלות רקע, אבחנות נפשיות (למשל חרדה או דיכאון), קשיי שינה ותרופות קבועות (אופציונלי)', ar: 'أمراض مزمنة، تشخيصات نفسية (مثل القلق أو الاكتئاب)، مشاكل نوم وأدوية دائمة (اختياري)', en: 'Medical conditions, mental-health diagnoses (e.g. anxiety or depression), sleep problems and regular medication (optional)' } },
];
