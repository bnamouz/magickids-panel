/**
 * Vanderbilt Teacher Form – 43 פריטים
 *
 *   Q1–Q9   Inattention      → ≥6 items rated 2-3 = positive
 *   Q10–Q18 Hyperactivity    → ≥6 items rated 2-3 = positive
 *   Q19–Q26 ODD/CD           → ≥3 items rated 2-3 = positive
 *   Q27–Q35 Anxiety/Dep      → ≥3 items rated 2-3 = positive
 *   Q36–Q38 Academic (1-5)   → impairment if ≥1 rated 4-5
 *   Q39–Q43 Behavioral (1-5) → impairment if ≥1 rated 4-5
 */

import type { VanderbiltQuestion } from './vanderbilt_parent';

export const VANDERBILT_TEACHER_QUESTIONS: VanderbiltQuestion[] = [
  // חוסר קשב 1-9
  { id: 1, category: 'inattention', section: 'A', text: 'לא מצליח לשים לב לפרטים או עושה טעויות מתוך חוסר תשומת לב בעבודה' },
  { id: 2, category: 'inattention', section: 'A', text: 'מתקשה לשמור על תשומת לב במשימות או פעילויות' },
  { id: 3, category: 'inattention', section: 'A', text: 'נראה שאינו מקשיב כשמדברים אליו ישירות' },
  { id: 4, category: 'inattention', section: 'A', text: 'לא ממלא הוראות ולא מסיים עבודה' },
  { id: 5, category: 'inattention', section: 'A', text: 'מתקשה בארגון משימות ופעילויות' },
  { id: 6, category: 'inattention', section: 'A', text: 'נמנע ממשימות הדורשות מאמץ מנטלי ממושך' },
  { id: 7, category: 'inattention', section: 'A', text: 'מאבד דברים שדרושים למשימות' },
  { id: 8, category: 'inattention', section: 'A', text: 'מוסח בקלות על-ידי גירויים חיצוניים' },
  { id: 9, category: 'inattention', section: 'A', text: 'שכחני בפעילויות יומיומיות' },

  // היפראקטיביות 10-18
  { id: 10, category: 'hyperactivity', section: 'A', text: 'מתפתל בכיסא או מנענע ידיים/רגליים' },
  { id: 11, category: 'hyperactivity', section: 'A', text: 'עוזב את מקומו בכיתה' },
  { id: 12, category: 'hyperactivity', section: 'A', text: 'רץ או מטפס במצבים לא מתאימים' },
  { id: 13, category: 'hyperactivity', section: 'A', text: 'מתקשה לעסוק בפעילויות בשקט' },
  { id: 14, category: 'hyperactivity', section: 'A', text: 'בתנועה מתמדת' },
  { id: 15, category: 'hyperactivity', section: 'A', text: 'מדבר יתר על המידה' },
  { id: 16, category: 'hyperactivity', section: 'A', text: 'משיב לפני שהשאלה הסתיימה' },
  { id: 17, category: 'hyperactivity', section: 'A', text: 'מתקשה להמתין בתור' },
  { id: 18, category: 'hyperactivity', section: 'A', text: 'מפריע או מתפרץ לאחרים' },

  // ODD / CD 19-26
  { id: 19, category: 'odd', section: 'A', text: 'מתווכח עם מבוגרים' },
  { id: 20, category: 'odd', section: 'A', text: 'מאבד שליטה' },
  { id: 21, category: 'odd', section: 'A', text: 'מתנגד פעיל לבקשות וכללים' },
  { id: 22, category: 'odd', section: 'A', text: 'מטריד אחרים בכוונה' },
  { id: 23, category: 'odd', section: 'A', text: 'מאשים אחרים בטעויותיו' },
  { id: 24, category: 'cd', section: 'A', text: 'מתעמת או מאיים על אחרים' },
  { id: 25, category: 'cd', section: 'A', text: 'יוזם קטטות פיזיות' },
  { id: 26, category: 'cd', section: 'A', text: 'משקר כדי לקבל הטבות או להימנע ממחויבויות' },

  // חרדה/דיכאון 27-35
  { id: 27, category: 'anxiety_dep', section: 'A', text: 'חרד או מודאג מדי' },
  { id: 28, category: 'anxiety_dep', section: 'A', text: 'מפחד לנסות דברים חדשים' },
  { id: 29, category: 'anxiety_dep', section: 'A', text: 'מרגיש חסר ערך או נחות' },
  { id: 30, category: 'anxiety_dep', section: 'A', text: 'מאשים את עצמו, מרגיש אשם' },
  { id: 31, category: 'anxiety_dep', section: 'A', text: 'מרגיש בודד או לא רצוי' },
  { id: 32, category: 'anxiety_dep', section: 'A', text: 'עצוב, לא שמח או מדוכא' },
  { id: 33, category: 'anxiety_dep', section: 'A', text: 'מתבייש או נבוך' },
  { id: 34, category: 'anxiety_dep', section: 'A', text: 'מסתגר חברתית' },
  { id: 35, category: 'anxiety_dep', section: 'A', text: 'מתלונן על כאבים פיזיים ללא סיבה רפואית' },

  // הישגים אקדמיים 36-38 (סקאלה 1-5)
  { id: 36, category: 'function', section: 'B', text: 'קריאה' },
  { id: 37, category: 'function', section: 'B', text: 'מתמטיקה' },
  { id: 38, category: 'function', section: 'B', text: 'ביטוי בכתב' },

  // תפקוד התנהגותי בכיתה 39-43 (סקאלה 1-5)
  { id: 39, category: 'function', section: 'B', text: 'יחסים עם בני גילו' },
  { id: 40, category: 'function', section: 'B', text: 'מעקב אחרי הוראות' },
  { id: 41, category: 'function', section: 'B', text: 'הפרעה לכיתה' },
  { id: 42, category: 'function', section: 'B', text: 'השלמת מטלות' },
  { id: 43, category: 'function', section: 'B', text: 'מיומנויות ארגון' },
];
