# מדריך פריסה ל-Vercel — מכון ילדי הקסם

מדריך צעד-אחר-צעד להעלאת פאנל האדמין לענן.
זמן הערכה: **10-15 דקות**.

---

## שלב 1: העלאת הקוד ל-GitHub

### 1.1 צור repository חדש
1. היכנס ל-[github.com](https://github.com) → **New repository**
2. שם: `magickids-panel` (או כל שם שתרצה)
3. **Private** — חשוב! (כי יש קוד עסקי)
4. **אל תסמן** "Initialize this repository with README" — יש לנו כבר קוד
5. Create repository

### 1.2 העלה את הקוד
פתח את PowerShell או Git Bash בתיקיית הפרויקט (`yaldey-mvp`) והרץ:

```bash
git init
git add .
git commit -m "Initial commit: admin panel MVP"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/magickids-panel.git
git push -u origin main
```

החלף `YOUR-USERNAME` בשם המשתמש שלך ב-GitHub.

בפעם הראשונה — GitHub יבקש ממך להתחבר. אם אין לך Git מותקן:
- הורד מ-[git-scm.com](https://git-scm.com/download/win)

---

## שלב 2: הפריסה ב-Vercel

### 2.1 חבר את חשבון Vercel
1. היכנס ל-[vercel.com](https://vercel.com) → **Sign up with GitHub**
2. אשר את הגישה של Vercel ל-GitHub

### 2.2 יבא את הפרויקט
1. **Add New → Project**
2. תראה את הרשימה של repositories שלך — לחץ **Import** ליד `magickids-panel`
3. **Framework Preset**: Next.js (מזוהה אוטומטית)
4. **Root Directory**: השאר `./`
5. **אל תלחץ Deploy עדיין!** — צריך להוסיף משתני סביבה קודם

### 2.3 הוסף משתני סביבה
לחץ על **Environment Variables** ובמסך שנפתח הוסף שלושה משתנים:

| Name                              | Value                                   |
| --------------------------------- | --------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | (מ-Supabase Dashboard → Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | (מ-Supabase Dashboard → Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY`       | (מ-Supabase Dashboard → Settings → API) |

**איך למצוא אותם:**
- Supabase Dashboard → **Project Settings → API**
- העתק:
  - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
  - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - **service_role** (SECRET!) → `SUPABASE_SERVICE_ROLE_KEY`

לכל משתנה — סמן את שלושת הסביבות: **Production, Preview, Development**.

### 2.4 Deploy!
לחץ **Deploy** ותמתין 2-3 דקות. תראה התקדמות של בנייה בזמן אמת.

בסיום — Vercel יראה לך URL:
```
https://magickids-panel-xxxxx.vercel.app
```

### 2.5 בדיקה
פתח את ה-URL במסגרת `/admin/login`:
```
https://magickids-panel-xxxxx.vercel.app/admin/login
```

התחבר עם:
- Email: `demo@yaldey.co.il`
- Password: `Baseem2108@`

אמור לעבוד! אם לא — ראה שלב 4 בהמשך.

---

## שלב 3: הגדרת הדומיין `app.magickidsinstitute.com`

### 3.1 ב-Vercel
1. פרויקט → **Settings → Domains**
2. הוסף: `app.magickidsinstitute.com`
3. Vercel יראה לך רשומות DNS שצריך להוסיף (בדרך כלל CNAME)

### 3.2 בספק הדומיין שלך
היכנס למנהל הדומיין (הספק ממנו קנית `magickidsinstitute.com`):
1. עבור ל-**DNS Management**
2. הוסף רשומת **CNAME**:
   - Name/Host: `app`
   - Value/Target: `cname.vercel-dns.com`
   - TTL: השאר ברירת מחדל (Auto או 3600)
3. שמור

### 3.3 המתן להפצת DNS
בדרך כלל 5-30 דקות. Vercel יזהה אוטומטית וינפיק SSL.

---

## שלב 4: פתרון בעיות

### הבנייה נכשלה
- לחץ על ה-deployment שנכשל וראה את הלוג
- שלח לי צילום מסך של השגיאה

### לוגין נכשל אחרי deploy
1. בדוק שמשתני הסביבה נוספו נכון (Vercel → Settings → Environment Variables)
2. **חשוב**: אחרי הוספת/עריכת משתני סביבה, צריך לעשות **Redeploy** (בטאב Deployments → שלוש נקודות → Redeploy)

### שגיאת 401/403 בלוגין
פתח את `/api/admin/auth/verify` דרך Network tab ב-DevTools וראה את ה-response.
שלח לי צילום מסך.

### לוגים
Vercel → הפרויקט → Deployments → הבחירה האחרונה → **Logs** — כאן תראה את כל הודעות `[verify]` והשגיאות.

---

## סיכום

אחרי שהכל עובד — יש לך פאנל אדמין נגיש מכל דפדפן בעולם ב-`https://app.magickidsinstitute.com/admin/login`.
כל שינוי בקוד שתדחוף ל-GitHub יפרוס אוטומטית תוך 30 שניות.
