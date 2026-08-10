# מערכת אבחון ADHD – מכון ילדי הקסם (MVP)

> שאלוני אבחון Vanderbilt דיגיטליים, ניקוד אוטומטי לפי DSM-5, וזימון תורים.
> בנוי על Next.js 14 + Supabase + Railway.

---

## תכונות עיקריות

- 📋 שאלון Vanderbilt להורה (55 שאלות) + למורה (43 שאלות), בעברית, RTL.
- 🔐 אימות מבוסס טוקנים (Magic Links) – ההורה והמורה נכנסים דרך קישור פרטי.
- 🎯 ניקוד אוטומטי לפי DSM-5 כולל פרופיל משולב הורה+מורה.
- 💾 שמירה אוטומטית כל 30 שניות (Resume בכל שלב).
- 🤝 ההורה יוצר קישור מורה ושולח דרך WhatsApp/מייל – **המורה לא עוברת דרך ההורה**.
- 📊 RLS מלא ב-Supabase, כולל הפרדה בין צוות קליני להורים/מורים.

---

## דרישות מערכת

- Node.js 18+ (מומלץ 20 LTS)
- Postgres 15+ (דרך Supabase או עצמאי)
- חשבון Supabase (free tier מספיק להתחלה)
- חשבון Railway (להעלאה לפרודקשן)

---

## התקנה מקומית

```bash
# 1. שכפול
git clone <repo-url>
cd yaldey-mvp

# 2. תלויות
npm install

# 3. משתני סביבה
cp .env.example .env.local
#  → ערוך את .env.local עם המפתחות שלך

# 4. הרץ סכימת SQL ב-Supabase
#  → הדבק את התוכן של ../yaldey_schema.sql לתוך SQL Editor של Supabase

# 5. הרצה
npm run dev
# → http://localhost:3000
```

---

## מבנה הפרויקט

```
yaldey-mvp/
├── app/                          # Next.js 14 App Router
│   ├── page.tsx                  # דף בית
│   ├── layout.tsx                # RTL Hebrew layout (Heebo font)
│   ├── globals.css               # Tailwind + brand colors
│   ├── onboarding/[token]/       # אשף קליטה (3 שלבים)
│   ├── questionnaire/parent/[token]/   # שאלון הורה
│   ├── teacher/[token]/          # שאלון מורה (גישה ישירה למורה)
│   ├── share-teacher/[token]/    # ההורה יוצר ושולח קישור מורה
│   ├── admin/                    # 🆕 פאנל צוות קליני
│   │   ├── login/                # כניסה (Supabase Auth)
│   │   ├── dashboard/            # סקירה כוללת + סטטיסטיקות
│   │   ├── sessions/             # רשימת תיקים + חיפוש + סינון
│   │   ├── sessions/[id]/        # צפייה מלאה בתיק (ניקוד, תשובות, הערות)
│   │   └── appointments/         # יומן פגישות
│   └── api/
│       ├── health                # GET status
│       ├── intake                # POST – יצירת session חדש
│       ├── questionnaire         # PATCH (auto-save) + POST (final + score)
│       ├── teacher-questionnaire # POST – יצירת קישור מורה (להורה)
│       ├── score                 # POST – ניקוד ידני (אד-הוק)
│       └── admin/                # 🆕 API אדמין (מוגן ב-middleware)
│           ├── auth/verify       # אימות צוות
│           └── notes             # הוספת הערות קליניות
│
├── components/forms/
│   ├── QuestionnaireForm.tsx     # שאלון הורה (6 שלבים, scale buttons)
│   └── TeacherQuestionnaireForm.tsx  # שאלון מורה (6 שלבים)
│
├── lib/
│   ├── supabase.ts               # admin + parent-token RLS clients
│   └── scoring.ts                # DSM-5 scoring engine v1
│
├── questions/
│   ├── vanderbilt_parent.ts      # 55 שאלות + scales
│   └── vanderbilt_teacher.ts     # 43 שאלות
│
├── public/                       # static assets
├── .env.example                  # תבנית משתני סביבה
└── package.json
```

---

## משתני סביבה (חובה)

| Variable | תיאור | חובה? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL של פרויקט Supabase | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (לקוח) | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (שרת – אל תחשוף!) | ✅ |
| `NEXT_PUBLIC_APP_URL` | URL ציבורי של האפליקציה | ✅ |
| `HMAC_SECRET` | hex 32-bytes לחתימת טוקנים | ✅ |
| `OPENAI_API_KEY` | לדוחות AI (Task 4) | מומלץ |
| `WABOX_TOKEN` | שליחת WhatsApp דרך WaBox/UltraMsg | אופציונלי |
| `TELEGRAM_BOT_TOKEN` | בוט Telegram | אופציונלי |
| `GCAL_CALENDAR_ID` | יומן Google | אופציונלי |

ראה `.env.example` לרשימה המלאה.

---

## ה-API ב-2 דקות

### יצירת session חדש (Onboarding)
```bash
POST /api/intake
Content-Type: application/json

{
  "child_first_name": "דני",
  "child_last_name": "כהן",
  "child_dob": "2015-03-12",
  "parent_name": "אבי כהן",
  "parent_phone": "0501234567",
  "parent_email": "avi@example.com",
  "concerns": "בעיות קשב בבית הספר"
}
→ { "parent_token": "...", "session_id": "uuid" }
```

### שמירת התקדמות שאלון (auto-save)
```bash
PATCH /api/questionnaire
{
  "token": "<parent_token>",
  "type": "vanderbilt_parent",
  "responses": { "1": 2, "2": 3, ... }
}
```

### שליחה סופית (ניקוד אוטומטי)
```bash
POST /api/questionnaire
{
  "token": "<parent_token>",
  "type": "vanderbilt_parent",
  "responses": { ... },
  "complete": true
}
→ { "score": { "raw": {...}, "byCategory": {...} } }
```

### יצירת קישור מורה (ההורה מבצע אחרי שסיים)
```bash
POST /api/teacher-questionnaire
{
  "parent_token": "<parent_token>",
  "teacher_name": "מורה דנה",
  "teacher_phone": "0502345678"
}
→ {
    "teacher_url": "https://app.../teacher/<token>",
    "whatsapp_url": "https://wa.me/...",
    "share_message": "שלום, אני הורה של ..."
  }
```

---

## מנוע הניקוד (DSM-5)

`lib/scoring.ts` מיישם את לוגיקת Vanderbilt-DSM5-v1:

| קטגוריה | סף | תוצאה |
|---|---|---|
| Inattention | ≥6 פריטים בציון 2-3 | חיובי |
| Hyperactivity | ≥6 פריטים בציון 2-3 | חיובי |
| ODD | ≥4 (הורה) / ≥3 (מורה) | חיובי |
| CD | ≥3 בציון 2-3 | חיובי |
| Anxiety/Dep | ≥3 בציון 2-3 | חיובי |
| Functional impairment | ≥1 בציון 4-5 | חיובי |

**פרופיל משולב**: מצריך הסכמה בין הורה ומורה גם ב-inattention/hyperactivity וגם בפגיעה בתפקוד.

**גרסת המנוע** מאוחסנת ב-DB בשדה `scores.engine_version` – `vanderbilt-dsm5-v1`.

---

## בדיקה מהירה (Demo mode)

ניתן להריץ את כל הזרימה ללא DB:

- `/questionnaire/parent/demo` – שאלון הורה (לא נשמר)
- `/teacher/demo` – שאלון מורה (לא נשמר)
- `/share-teacher/demo` – יצירת קישור מורה (טוקן `demo` בלבד)

---

## העלאה ל-Railway

1. צור פרויקט חדש ב-Railway → Deploy from GitHub.
2. הוסף את כל משתני הסביבה (מסך Variables).
3. Railway יזהה אוטומטית Next.js – `npm run build && npm start`.
4. הוסף Custom Domain (לדוגמא `app.yaldey.co.il`).
5. עדכן `NEXT_PUBLIC_APP_URL` לדומיין הסופי ובצע Redeploy.

> **הערה לפיתוח**: כל ה-routes משתמשים ב-`dynamic = 'force-dynamic'` להגנה מקאש. אין צורך ב-revalidate ידני.

---

## אבטחה

- ✅ Service role key נשמר רק בשרת (לא בלקוח)
- ✅ RLS פעיל על כל הטבלאות (`yaldey_schema.sql`)
- ✅ Tokens נוצרים כ-`gen_random_uuid()` + תאריך פג תוקף
- ✅ Audit log לכל פעולה רגישה (`audit_log` table)
- ⚠️ הוסף Rate Limiting (Upstash/Edge) בפרודקשן
- ⚠️ הוסף CAPTCHA על `/api/intake` (כניסה ציבורית)

---

## מה הלאה

ראה את המסמך הטכני המלא (`SPECIFICATION.md`) ואת תבניות ה-AI prompts (`prompts/`).

---

## רישיון

קנייני – מכון ילדי הקסם. כל הזכויות שמורות.
