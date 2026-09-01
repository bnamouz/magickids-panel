# Marhaba Sales — הפעלה על מגיק קידס פאנל

מודול שמוסיף לפאנל **סוכנת מכירות אוטומטית** (נור-סיילס) שמתקשרת למרפאות שיניים בישראל,
מקבעת דמו של Marhaba, ומעדכנת את הדשבורד.

**המודול משתמש מחדש** בכל התשתית הקיימת של הפאנל:
- אותה נור מ-ElevenLabs (agent `agent_7401m15cmgy9e38866m3tq30r3vr`)
- אותו מספר Twilio (`phnum_0801m15ct561fjsvtv8xrnddnkt5`)
- אותם `getSupabaseAdmin()` ו-`sendWhatsAppText()`
- אותו `middleware.ts` להגנה על `/admin/marhaba`

**אין קובץ חדש בקטגוריות רנא / נור-אישית.** רק תוספת של `marhaba/*` בכל מקום.

---

## שלב 1 — הרץ SQL migration ב-Supabase (2 דק')

1. פתח את פרויקט Supabase של magickids-panel
2. SQL Editor → New Query
3. העתק את התוכן של `db/migrations/20260901_marhaba_sales.sql` ← Run
4. בדוק: `SELECT * FROM marhaba_sales_dashboard;` — צריך להחזיר שורה עם אפסים
5. בדוק: `SELECT clinic_name, status FROM marhaba_leads;` — צריך 3 שורות דמו

## שלב 2 — הגדר משתני סביבה ב-Vercel (5 דק')

Vercel Dashboard → magickids-panel → Settings → Environment Variables → **חדש להוסיף**:

| שם | ערך | הערה |
|---|---|---|
| `BASEEM_PHONE` | `+972509955137` | לקבלת התראות בוואטסאפ |
| `MARHABA_CRON_SECRET` | `openssl rand -hex 32` בטרמינל | לאבטחת cron + import |
| `GOOGLE_PLACES_API_KEY` | `AIza...` | חדש: [console.cloud.google.com](https://console.cloud.google.com) → Enable Places API → Create Key |
| `MARHABA_DEMO_VIDEO_URL` | `https://marhaba.co.il/demo.mp4` | (אופציונלי — אחרי שתעלה סרטון) |

**קיימים אצלך כבר** — לא לשנות:
`ELEVENLABS_API_KEY`, `ELEVENLABS_WEBHOOK_SECRET`, `ULTRAMSG_INSTANCE_ID`, `ULTRAMSG_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

לאחר ההוספה — **Redeploy** כדי שהמשתנים ייטענו.

## שלב 3 — הוסף 5 כלים לנור ב-ElevenLabs (10 דק')

ElevenLabs Dashboard → Agents → **נור הקיימת** (לא ליצור חדשה!) → Tools → **+ Add Server Tool**

**Server URL לכל 5 הכלים**: `https://[your-vercel-domain]/api/marhaba/tool-call`
(לדוגמה: `https://magickids-panel.vercel.app/api/marhaba/tool-call`)

### 1. `check_demo_slots`
- Description: `החזר slots פנויים לדמו של ד"ר בסים לשבוע הקרוב`
- Parameters: (ריק)

### 2. `book_marhaba_demo`
- Description: `קבע דמו של Marhaba או callback עם הלקוח`
- Parameters:
  - `contact_name` (string) — שם הרופא/מנהל
  - `contact_phone` (string) — טלפון ישראלי
  - `clinic_name` (string) — שם המרפאה
  - `demo_date` (string) — YYYY-MM-DD
  - `demo_time` (string) — HH:mm
  - `type` (string) — "demo" או "callback"
  - `notes` (string, optional)

### 3. `send_marhaba_video`
- Description: `שלח וידאו של 60 שניות בוואטסאפ עם הסבר על Marhaba`
- Parameters:
  - `contact_phone` (string)
  - `contact_name` (string, optional)
  - `custom_message` (string, optional)

### 4. `mark_lead_not_interested`
- Description: `סמן שהלקוח לא מעוניין כרגע. חזרה עוד 90 יום אוטומטית`
- Parameters:
  - `contact_phone` (string)
  - `reason` (string) — "has_secretary" / "no_budget" / "not_now" / "other"

### 5. `escalate_to_baseem`
- Description: `העבר lead חם/מסובך לד"ר בסים לטיפול אישי`
- Parameters:
  - `contact_name` (string)
  - `contact_phone` (string)
  - `clinic_name` (string)
  - `reason` (string)

**חשוב**: כל 5 הכלים משתמשים באותו URL. ה-router ב-`app/api/marhaba/tool-call/route.ts` מפרש את `tool_name`.

## שלב 4 — Post-call Webhook (אופציונלי)

אם רוצה לסנכרן תוצאות שיחות למסד הנתונים:

ElevenLabs Dashboard → נור → Webhooks → Add Webhook
- **URL**: `https://[your-vercel-domain]/api/marhaba/post-call`
- **Event**: `post_call_transcription`
- **HMAC Secret**: `ELEVENLABS_WEBHOOK_SECRET` הקיים שלך

הקוד מסנן שיחות שאין להן `dynamic_variables.marhaba_sales_mode: "true"` — אז שיחות של נור-אישית שכבר יש להן webhook לא יושפעו.

## שלב 5 — בדיקה (5 דק')

### א. פתח את הדשבורד
`https://[your-vercel-domain]/admin/marhaba` — התחבר עם המשתמש שלך.
צריך לראות 3 leads דמו ואפסים בהכל.

### ב. בדיקת check_demo_slots
```bash
curl -X POST https://[your-vercel-domain]/api/marhaba/tool-call \
  -H "Content-Type: application/json" \
  -d '{"tool_name":"check_demo_slots","parameters":{},"conversation_id":"test"}'
```
צריך להחזיר `{ result: { available_slots: [...], speak_message: "..." } }`.

### ג. שיחת מכירה ראשונה — אליך
1. Supabase → marhaba_leads → הכנס שורה ידנית:
   ```sql
   INSERT INTO marhaba_leads (clinic_name, phone, status, fit_score)
   VALUES ('בדיקה - אני', '+972509955137', 'new', 10);
   ```
2. הפעל ידנית:
   ```bash
   curl -X POST "https://[your-vercel-domain]/api/marhaba/dial-next?force=1" \
     -H "Authorization: Bearer $MARHABA_CRON_SECRET"
   ```
3. הטלפון שלך יצלצל תוך 5-15 שניות. נור תדבר איתך כמו מוכרת של Marhaba.
4. גלם את הרופא: "כן, מה זה?" — נור אמורה להסביר על Marhaba ולנסות לקבוע דמו.

### ד. ייבוא leads אמיתיים (אחרי שיש לך Google API key)
```bash
curl -X POST https://[your-vercel-domain]/api/marhaba/import-leads \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $MARHABA_CRON_SECRET" \
  -d '{"city":"ירושלים","dry_run":true,"max":20}'
```
עם `dry_run:true` רק תראה מה יבוא. אם נראה טוב — שנה ל-`false`.

---

## Cron אוטומטי — דרך cron-job.org (חינמי)

**Vercel Hobby (חינם) מגביל cron לפעם ביום בלבד** — אז אנחנו משתמשים ב-[cron-job.org](https://cron-job.org) חינם, שמאפשר עד כל דקה.

### הגדרה (5 דק')

1. הרשם ב-[cron-job.org](https://cron-job.org) (חינמי, 0 credit card)
2. **Cronjobs** → **CREATE CRONJOB**:
   - **Title**: `Marhaba Sales — dial-next`
   - **URL**: `https://app.magickidsinstitute.com/api/marhaba/dial-next`
   - **Schedule** → **Advanced** → העתק:
     - Minutes: `*/30`
     - Hours: `6-15`
     - Days of month: `*`
     - Months: `*`
     - Days of week: `0-4`
     (זה = כל 30 דקות, א׳-ה׳, 06-15 UTC = 09-18 ישראל בקיץ)
   - **Advanced → Request method**: `POST`
   - **Advanced → Headers**: הוסף:
     ```
     Authorization: Bearer YOUR_MARHABA_CRON_SECRET
     ```
     (החלף `YOUR_MARHABA_CRON_SECRET` בערך של `MARHABA_CRON_SECRET` שהגדרת ב-Vercel)
   - **CREATE**

3. בדיקה: לחץ **Run now** — צריך להחזיר 200 עם `{"skipped":"no_leads_ready"}` (או שיחה אמיתית אם יש lead).

### למה זה בטוח
- כל execution בודק **business hours (Sun-Thu 09-18 Israel time)** בקוד עצמו, אז אפילו אם cron-job רץ בטעות בשבת, ה-endpoint מחזיר `outside_business_hours`.
- אם רוצה לעצור — מספיק לכבות את ה-job ב-cron-job.org.

### אלטרנטיבה: Vercel Pro ($20/חודש)
אם משדרג ל-Pro, אפשר להחזיר את בלוק `crons` ל-`vercel.json`:
```json
{
  "crons": [{"path": "/api/marhaba/dial-next", "schedule": "*/30 6-15 * * 0-4"}]
}
```

## Kill Switch — עצירת שיחות מיידית

אם משהו לא בסדר:
```sql
UPDATE marhaba_leads
SET next_action_at = NOW() + INTERVAL '30 days'
WHERE status IN ('new', 'queued');
```

או פשוט הסר את בלוק `crons` מ-`vercel.json` → Redeploy.

**רנא + נור-אישית ממשיכות לעבוד כרגיל — הן לא נגעו.**

---

## אדריכלות — לזכור

**נור אחת. שני מצבים.**

- שיחה נכנסת → prompt ברירת מחדל (מזכירה אישית של ד"ר בסים)
- שיחה יוצאת דרך `/api/nour/outbound-call` → override של `first_message` בלבד (קיים)
- שיחה יוצאת דרך `/api/marhaba/dial-next` → override מלא של `prompt` + `first_message` + `dynamic_variables.marhaba_sales_mode='true'` (**חדש**)

ה-post-call webhook קורא את `marhaba_sales_mode` ומחליט אם לעדכן `marhaba_leads` או לא. שיחות של נור-אישית לא מושפעות.

**עלות הפעלה חד-פעמית**: $0
**עלות תפעולית**: כ-$70/חודש עבור ~200 שיחות (משולם רק כשמדברים, לא על ניסיונות שנכשלים)

---

## בעיות נפוצות

**"missing_elevenlabs_key"** — הגדר `ELEVENLABS_API_KEY` ב-Vercel (זה שקיים לנור-אישית).

**"unauthorized" ב-`/api/marhaba/dial-next`** — ה-cron secret לא נשלח נכון. בדוק:
- Vercel cron אוטומטי שולח `x-vercel-cron` header — אתה לא צריך לעשות כלום.
- מ-curl: `-H "Authorization: Bearer $MARHABA_CRON_SECRET"`.
- מהדשבורד: הכפתור "הפעל שיחה עכשיו" עובד כי אתה מחובר.

**"outside_business_hours"** — הוסף `?force=1` ל-URL כדי לעקוף.

**Nour מדברת בערבית במקום עברית בשיחת מכירה** — בדוק ש-`conversation_config_override.agent.language` הוא `'he'` (זה מוגדר ב-`dial-next/route.ts`).

**שיחה שנכשלה לא חוזרת ל-queue** — היא כן — `dial-next/route.ts` מחזיר ל-`queued` עם `next_action_at` של +60 דק'. בדוק את הלוגים ב-Vercel אם היא לא חוזרת.
