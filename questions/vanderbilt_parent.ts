/**
 * Vanderbilt Parent Form – 55 פריטים
 * מבוסס על הטופס הרשמי של מכבי / NICHQ
 *
 * Sections:
 *   A. Symptoms (Q1–Q47)  scale 0–3 (אף פעם → לעיתים תכופות מאוד)
 *   B. Function (Q48–Q55) scale 1–5 (מצוין → בעייתי מאוד)
 *   C. Free text – חלק ג׳
 *
 * Scoring (DSM-5):
 *   Q1–Q9   Inattention      → ≥6 items rated 2-3 = positive
 *   Q10–Q18 Hyperactivity    → ≥6 items rated 2-3 = positive
 *   Q19–Q26 ODD              → ≥4 items rated 2-3 = positive
 *   Q27–Q40 Conduct (CD)     → ≥3 items rated 2-3 = positive
 *   Q41–Q47 Anxiety/Depression → ≥3 items rated 2-3 = positive
 *   Q48–Q55 Function impair  → ≥1 item rated 4-5 = impairment
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

export const VANDERBILT_PARENT_QUESTIONS: VanderbiltQuestion[] = [
  // ===== חוסר קשב (1-9) =====
  { id: 1, category: 'inattention', section: 'A', text: 'לא מצליח לשים לב לפרטים או עושה טעויות מתוך חוסר תשומת לב בעבודת בית-ספר' },
  { id: 2, category: 'inattention', section: 'A', text: 'מתקשה לשמור על תשומת לב במשימות או בפעילויות משחק' },
  { id: 3, category: 'inattention', section: 'A', text: 'נראה שאינו מקשיב כשמדברים אליו ישירות' },
  { id: 4, category: 'inattention', section: 'A', text: 'לא ממלא הוראות ולא מסיים עבודה (לא מתוך התנגדות או חוסר הבנה)' },
  { id: 5, category: 'inattention', section: 'A', text: 'מתקשה בארגון משימות ופעילויות' },
  { id: 6, category: 'inattention', section: 'A', text: 'נמנע, לא אוהב, או מתנגד להשתתף במשימות הדורשות מאמץ מנטלי ממושך' },
  { id: 7, category: 'inattention', section: 'A', text: 'מאבד דברים שדרושים למשימות או פעילויות (צעצועים, מטלות, עפרונות, ספרים)' },
  { id: 8, category: 'inattention', section: 'A', text: 'מוסח בקלות על-ידי גירויים חיצוניים' },
  { id: 9, category: 'inattention', section: 'A', text: 'שכחני בפעילויות יומיומיות' },

  // ===== היפראקטיביות/אימפולסיביות (10-18) =====
  { id: 10, category: 'hyperactivity', section: 'A', text: 'מתפתל בכיסא או מנענע ידיים/רגליים' },
  { id: 11, category: 'hyperactivity', section: 'A', text: 'עוזב את מקומו בכיתה או במצבים אחרים בהם מצופה להישאר יושב' },
  { id: 12, category: 'hyperactivity', section: 'A', text: 'רץ או מטפס במצבים לא מתאימים' },
  { id: 13, category: 'hyperactivity', section: 'A', text: 'מתקשה לשחק או לעסוק בפעילויות פנאי בשקט' },
  { id: 14, category: 'hyperactivity', section: 'A', text: 'נמצא בתנועה מתמדת, "כאילו מונע על-ידי מנוע"' },
  { id: 15, category: 'hyperactivity', section: 'A', text: 'מדבר יתר על המידה' },
  { id: 16, category: 'hyperactivity', section: 'A', text: 'משיב תשובות לפני שהשאלה הסתיימה' },
  { id: 17, category: 'hyperactivity', section: 'A', text: 'מתקשה להמתין בתור' },
  { id: 18, category: 'hyperactivity', section: 'A', text: 'מפריע או מתפרץ לאחרים (בשיחה או במשחק)' },

  // ===== ODD - הפרעת התנגדות (19-26) =====
  { id: 19, category: 'odd', section: 'A', text: 'מתעצבן או מאבד שליטה' },
  { id: 20, category: 'odd', section: 'A', text: 'מתווכח עם מבוגרים' },
  { id: 21, category: 'odd', section: 'A', text: 'מתנגד באופן פעיל או מסרב למלא בקשות או כללים של מבוגרים' },
  { id: 22, category: 'odd', section: 'A', text: 'מטריד אנשים אחרים במכוון' },
  { id: 23, category: 'odd', section: 'A', text: 'מאשים אחרים בטעויות או בהתנהגות בעייתית שלו' },
  { id: 24, category: 'odd', section: 'A', text: 'מתרגז בקלות / רגיש' },
  { id: 25, category: 'odd', section: 'A', text: 'כועס ונוטר טינה' },
  { id: 26, category: 'odd', section: 'A', text: 'משתמש בלשון רעה / זדוני / נוקם' },

  // ===== CD - הפרעת התנהגות (27-40) =====
  { id: 27, category: 'cd', section: 'A', text: 'מתעמת ומאיים על אחרים' },
  { id: 28, category: 'cd', section: 'A', text: 'יוזם קטטות פיזיות' },
  { id: 29, category: 'cd', section: 'A', text: 'משתמש בכלי שעלול לפגוע באחרים (אבן, מקל, סכין)' },
  { id: 30, category: 'cd', section: 'A', text: 'אכזרי פיזית כלפי בני אדם' },
  { id: 31, category: 'cd', section: 'A', text: 'אכזרי פיזית כלפי בעלי חיים' },
  { id: 32, category: 'cd', section: 'A', text: 'גנב מתוך עימות עם הקרבן (שוד, כייסות)' },
  { id: 33, category: 'cd', section: 'A', text: 'אונס מינית' },
  { id: 34, category: 'cd', section: 'A', text: 'הצית אש בכוונה לגרום נזק' },
  { id: 35, category: 'cd', section: 'A', text: 'השמיד רכוש של אחרים בכוונה' },
  { id: 36, category: 'cd', section: 'A', text: 'פרץ לבית, בניין או רכב של אחרים' },
  { id: 37, category: 'cd', section: 'A', text: 'משקר כדי להשיג טובות הנאה או להתחמק ממחויבויות' },
  { id: 38, category: 'cd', section: 'A', text: 'גנב פריטים בעלי ערך לא מבוטל ללא עימות (פריצה לחנות, זיוף)' },
  { id: 39, category: 'cd', section: 'A', text: 'יוצא מהבית בלילה למרות איסור הורים (החל מגיל 13)' },
  { id: 40, category: 'cd', section: 'A', text: 'בורח מהבית או נעדר מבית הספר' },

  // ===== חרדה/דיכאון (41-47) =====
  { id: 41, category: 'anxiety_dep', section: 'A', text: 'חרד או מודאג מדי' },
  { id: 42, category: 'anxiety_dep', section: 'A', text: 'מפחד לנסות דברים חדשים מחשש לטעות' },
  { id: 43, category: 'anxiety_dep', section: 'A', text: 'מרגיש חסר ערך או נחות' },
  { id: 44, category: 'anxiety_dep', section: 'A', text: 'מאשים את עצמו במצבים, מרגיש אשם' },
  { id: 45, category: 'anxiety_dep', section: 'A', text: 'מרגיש בודד, לא רצוי או לא אהוב; מתלונן ש"אף אחד לא אוהב אותי"' },
  { id: 46, category: 'anxiety_dep', section: 'A', text: 'עצוב, לא שמח או מדוכא' },
  { id: 47, category: 'anxiety_dep', section: 'A', text: 'מתבייש, נבוך או לא בטוח בעצמו' },

  // ===== תפקוד (48-55) – סקאלת 1-5 =====
  { id: 48, category: 'function', section: 'B', text: 'הישגים בקריאה' },
  { id: 49, category: 'function', section: 'B', text: 'הישגים בכתיבה' },
  { id: 50, category: 'function', section: 'B', text: 'הישגים במתמטיקה' },
  { id: 51, category: 'function', section: 'B', text: 'יחסים עם הורים' },
  { id: 52, category: 'function', section: 'B', text: 'יחסים עם אחים' },
  { id: 53, category: 'function', section: 'B', text: 'יחסים עם בני גילו' },
  { id: 54, category: 'function', section: 'B', text: 'השתתפות בפעילויות מאורגנות (ספורט, חוגים)' },
  { id: 55, category: 'function', section: 'B', text: 'תפקוד יומיומי בבית (שיעורים, מטלות, ארגון עצמי)' },
];

export const SCALE_A = [
  { value: 0, label: 'אף פעם' },
  { value: 1, label: 'לעיתים נדירות' },
  { value: 2, label: 'לעיתים' },
  { value: 3, label: 'לעיתים תכופות מאוד' },
];

export const SCALE_B = [
  { value: 1, label: 'מצוין' },
  { value: 2, label: 'מעל הממוצע' },
  { value: 3, label: 'ממוצע' },
  { value: 4, label: 'מתחת לממוצע' },
  { value: 5, label: 'בעייתי מאוד' },
];
