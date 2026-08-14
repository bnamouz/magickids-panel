'use client';

import { useState } from 'react';

type FormState = {
  child_first_name: string;
  child_last_name: string;
  birth_date: string;
  gender: '' | 'male' | 'female';
  grade: string;
  school: string;
  parent_name: string;
  relation: 'mother' | 'father' | 'guardian' | 'other';
  parent_phone: string;
  parent_email: string;
  reason_for_referral: string;
  medical_notes: string;
  medications: string;
  consent: boolean;
};

const initial: FormState = {
  child_first_name: '',
  child_last_name: '',
  birth_date: '',
  gender: '',
  grade: '',
  school: '',
  parent_name: '',
  relation: 'mother',
  parent_phone: '',
  parent_email: '',
  reason_for_referral: '',
  medical_notes: '',
  medications: '',
  consent: false,
};

export default function RegisterPage() {
  const [form, setForm] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ parent_url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...form,
          gender: form.gender || undefined,
          parent_email: form.parent_email || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          typeof data.error === 'string'
            ? data.error
            : 'שגיאה בשליחת הטופס. נסה שוב או צור קשר.'
        );
      } else {
        setResult({ parent_url: data.parent_url });
      }
    } catch (e: any) {
      setError('שגיאה בחיבור לשרת. בדוק את החיבור לאינטרנט ונסה שוב.');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <main dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <svg viewBox="0 0 24 24" className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">הרישום הושלם בהצלחה</h1>
            <p className="text-slate-600">תודה. הצוות שלנו יצור עמך קשר בהקדם.</p>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-4">
            <p className="font-semibold text-slate-900 mb-2">השלב הבא — מילוי שאלון ההורה</p>
            <p className="text-slate-700 text-sm mb-4">
              כדי להתקדם באבחון, אנא מלא את שאלון הוונדרבילט להורה. השאלון אורך כ-10 דקות.
            </p>
            <a
              href={result.parent_url}
              className="inline-block w-full text-center bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-xl transition"
            >
              מעבר לשאלון ההורה
            </a>
          </div>

          <div className="text-xs text-slate-500 text-center border-t pt-4">
            אם הכפתור לא עובד, העתק את הקישור הבא לדפדפן:
            <div className="mt-2 break-all font-mono text-slate-700 bg-slate-100 rounded p-2">
              {result.parent_url}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <header className="text-center mb-8">
          <div className="inline-block bg-white rounded-2xl shadow-sm px-6 py-4 mb-4">
            <h1 className="text-2xl font-bold text-slate-900">מכון ילדי הקסם</h1>
            <p className="text-sm text-slate-600 mt-1">ד"ר בסים נמוז — רופא ילדים, מומחה קשב וריכוז</p>
          </div>
          <h2 className="text-xl font-semibold text-slate-800">טופס רישום לאבחון</h2>
          <p className="text-sm text-slate-600 mt-2">
            מלא את הפרטים הבאים כדי לפתוח תיק חדש. השדות המסומנים ב-<span className="text-rose-500">*</span> חובה.
          </p>
        </header>

        <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow-md p-6 space-y-6">
          {/* Child */}
          <section>
            <h3 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b">פרטי הילד/ה</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="שם פרטי" required>
                <input
                  type="text"
                  value={form.child_first_name}
                  onChange={(e) => update('child_first_name', e.target.value)}
                  required
                  className={inputCls}
                />
              </Field>
              <Field label="שם משפחה" required>
                <input
                  type="text"
                  value={form.child_last_name}
                  onChange={(e) => update('child_last_name', e.target.value)}
                  required
                  className={inputCls}
                />
              </Field>
              <Field label="תאריך לידה" required>
                <input
                  type="date"
                  value={form.birth_date}
                  onChange={(e) => update('birth_date', e.target.value)}
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  className={inputCls}
                />
              </Field>
              <Field label="מין">
                <select
                  value={form.gender}
                  onChange={(e) => update('gender', e.target.value as any)}
                  className={inputCls}
                >
                  <option value="">בחר...</option>
                  <option value="male">בן</option>
                  <option value="female">בת</option>
                </select>
              </Field>
              <Field label="בית ספר / מסגרת">
                <input
                  type="text"
                  value={form.school}
                  onChange={(e) => update('school', e.target.value)}
                  className={inputCls}
                  placeholder="שם המוסד"
                />
              </Field>
              <Field label="כיתה">
                <input
                  type="text"
                  value={form.grade}
                  onChange={(e) => update('grade', e.target.value)}
                  className={inputCls}
                  placeholder='למשל: ג׳-2'
                />
              </Field>
            </div>
          </section>

          {/* Parent */}
          <section>
            <h3 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b">פרטי ההורה הממלא</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="שם מלא" required>
                <input
                  type="text"
                  value={form.parent_name}
                  onChange={(e) => update('parent_name', e.target.value)}
                  required
                  className={inputCls}
                />
              </Field>
              <Field label="קשר לילד" required>
                <select
                  value={form.relation}
                  onChange={(e) => update('relation', e.target.value as any)}
                  className={inputCls}
                >
                  <option value="mother">אם</option>
                  <option value="father">אב</option>
                  <option value="guardian">אפוטרופוס</option>
                  <option value="other">אחר</option>
                </select>
              </Field>
              <Field label="טלפון נייד" required>
                <input
                  type="tel"
                  value={form.parent_phone}
                  onChange={(e) => update('parent_phone', e.target.value)}
                  required
                  className={inputCls}
                  placeholder="05X-XXXXXXX"
                />
              </Field>
              <Field label="אימייל (לא חובה)">
                <input
                  type="email"
                  value={form.parent_email}
                  onChange={(e) => update('parent_email', e.target.value)}
                  className={inputCls}
                  placeholder="you@example.com"
                />
              </Field>
            </div>
          </section>

          {/* Medical */}
          <section>
            <h3 className="text-lg font-semibold text-slate-900 mb-4 pb-2 border-b">רקע רפואי</h3>
            <div className="space-y-4">
              <Field label="סיבת הפנייה / תלונה עיקרית" required>
                <textarea
                  value={form.reason_for_referral}
                  onChange={(e) => update('reason_for_referral', e.target.value)}
                  required
                  rows={3}
                  className={inputCls}
                  placeholder="למה פנית אלינו? מה מטריד אותך אצל הילד/ה?"
                />
              </Field>
              <Field label="מחלות רקע / אבחנות קיימות (לא חובה)">
                <textarea
                  value={form.medical_notes}
                  onChange={(e) => update('medical_notes', e.target.value)}
                  rows={2}
                  className={inputCls}
                  placeholder="אלרגיות, אבחנות קודמות, בעיות רפואיות ידועות"
                />
              </Field>
              <Field label="טיפול תרופתי קבוע (לא חובה)">
                <input
                  type="text"
                  value={form.medications}
                  onChange={(e) => update('medications', e.target.value)}
                  className={inputCls}
                  placeholder="שם התרופה ומינון"
                />
              </Field>
            </div>
          </section>

          {/* Consent */}
          <section>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.consent}
                onChange={(e) => update('consent', e.target.checked)}
                required
                className="mt-1 w-5 h-5 text-emerald-600 rounded"
              />
              <span className="text-sm text-slate-700">
                אני מסכים/ה לביצוע האבחון ולעיבוד המידע לצורך אבחון וטיפול, בהתאם למדיניות הפרטיות של המכון.
                <span className="text-rose-500">*</span>
              </span>
            </label>
          </section>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-4 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !form.consent}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition text-lg"
          >
            {submitting ? 'שולח...' : 'שלח והתחל אבחון'}
          </button>
        </form>

        <footer className="text-center text-xs text-slate-500 mt-6">
          © {new Date().getFullYear()} מכון ילדי הקסם. כל הזכויות שמורות.
        </footer>
      </div>
    </main>
  );
}

const inputCls =
  'w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-900 bg-white';

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
