/**
 * Vanderbilt Parent Form – 55 שאלות
 * מבוסס על טופס NICHQ Vanderbilt הרשמי (מכבי שירותי בריאות)
 *
 * Sections:
 *   Intro    – פרטים אישיים והתייחסות (מצב משפחתי, שפות, חוזקות, קושי עיקרי, טיפול תרופתי)
 *   Symptoms – שאלון 1 (Q1–Q47), סקאלה 0–3 (אף פעם → כל הזמן)
 *   Function – שאלון 2 (Q48–Q55), סקאלה 1–5 (מעולה → בעייתי)
 *
 * Scoring (DSM-5):
 *   Q1–Q9    Inattention        → ≥6 items rated 2-3 = positive
 *   Q10–Q18  Hyperactivity      → ≥6 items rated 2-3 = positive
 *   Q19–Q26  ODD                → ≥4 items rated 2-3 = positive
 *   Q27–Q40  Conduct Disorder   → ≥3 items rated 2-3 = positive
 *   Q41–Q47  Anxiety/Depression → ≥3 items rated 2-3 = positive
 *   Q48–Q55  Function           → ≥1 item rated 4-5 = impairment
 */

export type SymptomCategory =
  | 'inattention'
  | 'hyperactivity'
  | 'odd'
  | 'cd'
  | 'anxiety_dep'
  | 'function';

export interface VanderbiltQuestion {
  id: number;
  text: string;
  category: SymptomCategory;
  section: 'A' | 'B';
}

// ============================================================
// Intro fields — שדות מבוא (חלק לפני השאלון)
// ============================================================
export type IntroFieldType = 'radio' | 'text' | 'textarea';

export interface IntroField {
  id: string;
  label: string;
  type: IntroFieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  otherField?: string; // אם נבחר "אחר" — לפרט בשדה טקסט
  placeholder?: string;
}

export const VANDERBILT_PARENT_INTRO_FIELDS: IntroField[] = [
  {
    id: 'marital_status',
    label: 'מצב משפחתי',
    type: 'radio',
    required: true,
    options: [
      { value: 'married', label: 'נשואים' },
      { value: 'single_parent', label: 'אב/אם חד הוריים' },
      { value: 'divorced', label: 'גרושים' },
      { value: 'other', label: 'אחר' },
    ],
    otherField: 'marital_status_other',
  },
  {
    id: 'languages',
    label: 'לאילו שפות חשוף/ה ילדכם/ילדתכם?',
    type: 'text',
    required: false,
    placeholder: 'למשל: עברית, ערבית, אנגלית',
  },
  {
    id: 'strengths',
    label: 'מהם תחומי החוזק של הילד/ה?',
    type: 'textarea',
    required: false,
  },
  {
    id: 'main_difficulty',
    label: 'באיזה תחום הקושי של הילד/ה הוא הגדול ביותר ובו לדעתך נדרש סיוע?',
    type: 'textarea',
    required: true,
  },
  {
    id: 'medication_status',
    label: 'האם הערכה זו התבססה על הילד/ה בזמן שהוא/היא:',
    type: 'radio',
    required: true,
    options: [
      { value: 'on_medication', label: 'נטל/ה תרופה' },
      { value: 'off_medication', label: 'לא נטל/ה תרופה' },
      { value: 'unsure', label: 'לא בטוח/ה' },
    ],
  },
];

// ============================================================
// שאלון 1 – סימפטומים (Q1–Q47), סקאלה 0–3
// ============================================================
export const VANDERBILT_PARENT_QUESTIONS: VanderbiltQuestion[] = [
  // ===== חוסר קשב (1–9) =====
  { id: 1, category: 'inattention', section: 'A', text: 'אינו/ה שם לב לפרטים או עושה טעויות רשלניות בשיעורי בית' },
  { id: 2, category: 'inattention', section: 'A', text: 'מתקשה להקשיב למה שהתבקש ממנו/ה' },
  { id: 3, category: 'inattention', section: 'A', text: 'אינו/ה מקשיב/ה כאשר מדברים אתו/ה ישירות' },
  { id: 4, category: 'inattention', section: 'A', text: 'מתקשה לעקוב אחר הוראות ואינו/ה מסיים/ת משימות (לא בגלל שמתנגד/ה או לא מבין/ה משימה)' },
  { id: 5, category: 'inattention', section: 'A', text: 'מתקשה לארגן משימות או פעילויות' },
  { id: 6, category: 'inattention', section: 'A', text: 'נמנע/ת, לא אוהב/ת, או לא רוצה להתחיל משימות הדורשות מאמץ שכלי ממושך' },
  { id: 7, category: 'inattention', section: 'A', text: 'מאבד/ת חפצים הדרושים למשימות או פעילויות (כגון: צעצועים, שיעורי בית, עפרונות או ספרים)' },
  { id: 8, category: 'inattention', section: 'A', text: 'מוסח/ת בקלות ע"י רעש או גירויים אחרים' },
  { id: 9, category: 'inattention', section: 'A', text: 'שוכח/ת מטלות יומיומיות' },

  // ===== היפראקטיביות/אימפולסיביות (10–18) =====
  { id: 10, category: 'hyperactivity', section: 'A', text: 'חסר/ת מנוחה בזמן ישיבה, נטייה להזיז ידיים או רגליים' },
  { id: 11, category: 'hyperactivity', section: 'A', text: 'קם/ה ממקומו/ה כאשר מצופה ממנו/ה לשבת' },
  { id: 12, category: 'hyperactivity', section: 'A', text: 'רץ/ה או מטפס/ת כאשר מצופה ממנו/ה לשבת במקומו/ה' },
  { id: 13, category: 'hyperactivity', section: 'A', text: 'מתקשה לשחק בשקט או להתחיל פעילויות שקטות' },
  { id: 14, category: 'hyperactivity', section: 'A', text: 'נראה/ית פעיל/ה או "מונע/ת ע"י מנוע"' },
  { id: 15, category: 'hyperactivity', section: 'A', text: 'מדבר/ת יותר מדי' },
  { id: 16, category: 'hyperactivity', section: 'A', text: 'מתפרץ/ת עם תשובות לפני סיום השאלות' },
  { id: 17, category: 'hyperactivity', section: 'A', text: 'מתקשה לחכות בתור' },
  { id: 18, category: 'hyperactivity', section: 'A', text: 'מתפרץ/ת ומפריע/ה לשיחות ו/או משחקים של אחרים' },

  // ===== ODD – הפרעת התנגדות (19–26) =====
  { id: 19, category: 'odd', section: 'A', text: 'מתווכח/ת עם מבוגרים' },
  { id: 20, category: 'odd', section: 'A', text: 'מתפרץ/ת ומאבד/ת שליטה על המזג' },
  { id: 21, category: 'odd', section: 'A', text: 'מתנגד/ת או "מצפצף/ת" להוראות או כללי מבוגרים' },
  { id: 22, category: 'odd', section: 'A', text: 'מרגיז/ה אנשים בכוונה' },
  { id: 23, category: 'odd', section: 'A', text: 'מאשים/ה אחרים כאשר טועה או אינו/ה מתנהג/ת כראוי' },
  { id: 24, category: 'odd', section: 'A', text: 'מתרגז/ת בקלות' },
  { id: 25, category: 'odd', section: 'A', text: 'כועס/ת או זעוף/ה' },
  { id: 26, category: 'odd', section: 'A', text: '"עושה דווקא" ורוצה להתנקם באחרים' },

  // ===== CD – הפרעת התנהגות (27–40) =====
  { id: 27, category: 'cd', section: 'A', text: 'מתנהג/ת כמו "בריון/ית", מאיים/ת ומפחיד/ה אחרים' },
  { id: 28, category: 'cd', section: 'A', text: 'מתחיל/ה מאבקים פיזיים' },
  { id: 29, category: 'cd', section: 'A', text: 'משקר/ת או מרמה אחרים כאשר "נכנס/ת לצרות"' },
  { id: 30, category: 'cd', section: 'A', text: 'נעדר/ת מבית הספר ללא רשות' },
  { id: 31, category: 'cd', section: 'A', text: 'אכזרי/ת בצורה פיזית כלפי אנשים' },
  { id: 32, category: 'cd', section: 'A', text: 'גונב/ת חפצים בעלי ערך' },
  { id: 33, category: 'cd', section: 'A', text: 'הורס/ת דברים השייכים לאחרים בכוונה' },
  { id: 34, category: 'cd', section: 'A', text: 'השתמש/ה בכלי נשק שיכול לגרום נזק רב (סכין, אבן, אקדח)' },
  { id: 35, category: 'cd', section: 'A', text: 'אכזרי/ת כלפי בעלי חיים' },
  { id: 36, category: 'cd', section: 'A', text: 'הצית/ה בית על מנת לגרום נזק' },
  { id: 37, category: 'cd', section: 'A', text: 'התפרץ/ה לתוך בית או אוטו' },
  { id: 38, category: 'cd', section: 'A', text: 'נשאר/ה בחוץ במשך כל הלילה ללא רשות' },
  { id: 39, category: 'cd', section: 'A', text: 'ברח/ה מהבית למשך לילה שלם' },
  { id: 40, category: 'cd', section: 'A', text: 'ניסה/תה לכפות פעילות מינית' },

  // ===== חרדה/דיכאון (41–47) =====
  { id: 41, category: 'anxiety_dep', section: 'A', text: 'דואג/ת, חרד/ה, פוחד/ת' },
  { id: 42, category: 'anxiety_dep', section: 'A', text: 'מפחד/ת לנסות דברים חדשים בגלל פחד לטעות' },
  { id: 43, category: 'anxiety_dep', section: 'A', text: 'מרגיש/ה חסר ערך או נחות' },
  { id: 44, category: 'anxiety_dep', section: 'A', text: 'מאשים/ה את עצמו/ה לגבי בעיותיו, מרגיש אשם/ה' },
  { id: 45, category: 'anxiety_dep', section: 'A', text: 'מרגיש/ה בודד/ה, דחוי/ה, "לא אהוב/ה", מתלונן שאף אחד אינו אוהב אותו/ה' },
  { id: 46, category: 'anxiety_dep', section: 'A', text: 'עצוב/ה, לא מאושר/ת, מדוכא/ת' },
  { id: 47, category: 'anxiety_dep', section: 'A', text: 'נבוך/ה בקלות' },

  // ===== שאלון 2 – תפקוד לימודי (48–55), סקאלה 1–5 =====
  { id: 48, category: 'function', section: 'B', text: 'תפקוד כללי בבית ספר' },
  { id: 49, category: 'function', section: 'B', text: 'קריאה' },
  { id: 50, category: 'function', section: 'B', text: 'כתיבה' },
  { id: 51, category: 'function', section: 'B', text: 'חשבון' },
  { id: 52, category: 'function', section: 'B', text: 'יחסים עם ההורים' },
  { id: 53, category: 'function', section: 'B', text: 'יחסים עם אחים' },
  { id: 54, category: 'function', section: 'B', text: 'יחסים על ילדים אחרים' },
  { id: 55, category: 'function', section: 'B', text: 'השתתפות בפעילויות מאורגנות (קבוצות ספורט)' },
];

// ============================================================
// סקאלות
// ============================================================
export const SCALE_A = [
  { value: 0, label: 'אף פעם' },
  { value: 1, label: 'לפעמים' },
  { value: 2, label: 'לעיתים קרובות' },
  { value: 3, label: 'כל הזמן' },
];

export const SCALE_B = [
  { value: 1, label: 'מעולה' },
  { value: 2, label: 'מעל הממוצע' },
  { value: 3, label: 'ממוצע' },
  { value: 4, label: 'מעט בעייתי' },
  { value: 5, label: 'בעייתי' },
];
