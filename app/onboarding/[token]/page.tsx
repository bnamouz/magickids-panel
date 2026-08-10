'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function OnboardingPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    child_first_name: '',
    child_last_name: '',
    birth_date: '',
    gender: 'male',
    grade: '',
    school: '',
    teacher_name: '',
    teacher_phone: '',
    parent_name: '',
    parent_phone: '',
    parent_email: '',
    relation: 'mother',
    consent: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof data>(key: K, value: any) {
    setData(prev => ({ ...prev, [key]: value }));
  }

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, channel: 'manual' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(json.error));
      router.push(`/questionnaire/parent/${json.parent_token}`);
    } catch (e: any) {
      setError(e.message || 'שגיאה');
    } finally {
      setLoading(false);
    }
  }

  // Demo mode skip to questionnaire
  if (params.token === 'demo') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="card">
          <h1 className="text-3xl font-bold text-[#01696f] mb-4">מצב הדגמה</h1>
          <p className="text-slate-700 mb-6">
            במצב הדגמה לא צריך למלא טופס פתיחה. ניתן לדלג ישירות לשאלון.
          </p>
          <button
            onClick={() => router.push('/questionnaire/parent/demo')}
            className="btn-primary"
          >
            דלג לשאלון Vanderbilt ←
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="card mb-6">
        <div className="text-sm text-orange-600 font-semibold mb-2">שלב {step} מתוך 3</div>
        <h1 className="text-2xl font-bold text-[#01696f]">פתיחת תיק חדש</h1>
        <div className="bg-slate-100 rounded-full h-2 mt-4 overflow-hidden">
          <div className="h-full bg-[#01696f] transition-all" style={{ width: `${(step / 3) * 100}%` }} />
        </div>
      </div>

      <div className="card">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[#01696f] mb-2">פרטי הילד</h2>
            <Input label="שם פרטי" value={data.child_first_name} onChange={(v: string) => update('child_first_name', v)} />
            <Input label="שם משפחה" value={data.child_last_name} onChange={(v: string) => update('child_last_name', v)} />
            <Input label="תאריך לידה" type="date" value={data.birth_date} onChange={(v: string) => update('birth_date', v)} />
            <Select label="מין" value={data.gender} onChange={(v: string) => update('gender', v)} options={[
              { v: 'male', l: 'זכר' }, { v: 'female', l: 'נקבה' }, { v: 'other', l: 'אחר' },
            ]} />
            <Input label="כיתה" value={data.grade} onChange={(v: string) => update('grade', v)} />
            <Input label="בית ספר" value={data.school} onChange={(v: string) => update('school', v)} />
            <button onClick={() => setStep(2)} className="btn-primary w-full">המשך ←</button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[#01696f] mb-2">פרטי המורה</h2>
            <p className="text-sm text-slate-600">דרושים כדי לשלוח את שאלון המורה ישירות אליה.</p>
            <Input label="שם המורה" value={data.teacher_name} onChange={(v: string) => update('teacher_name', v)} />
            <Input label="טלפון המורה (WhatsApp)" value={data.teacher_phone} onChange={(v: string) => update('teacher_phone', v)} />
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="btn-ghost flex-1">חזור</button>
              <button onClick={() => setStep(3)} className="btn-primary flex-1">המשך ←</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[#01696f] mb-2">פרטי ההורה והסכמה</h2>
            <Select label="קירבה" value={data.relation} onChange={(v: string) => update('relation', v)} options={[
              { v: 'mother', l: 'אמא' }, { v: 'father', l: 'אבא' },
              { v: 'guardian', l: 'אפוטרופוס' }, { v: 'other', l: 'אחר' },
            ]} />
            <Input label="שם מלא" value={data.parent_name} onChange={(v: string) => update('parent_name', v)} />
            <Input label="טלפון" value={data.parent_phone} onChange={(v: string) => update('parent_phone', v)} />
            <Input label="אימייל (אופציונלי)" type="email" value={data.parent_email} onChange={(v: string) => update('parent_email', v)} />

            <label className="flex gap-3 items-start bg-[#fff7ed] p-4 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={data.consent}
                onChange={e => update('consent', e.target.checked)}
                className="mt-1 w-5 h-5 accent-[#da7101]"
              />
              <span className="text-sm text-slate-700">
                אני מסכים לעיבוד מידע רפואי לצורך אבחון לפי חוק הגנת הפרטיות (תיקון 13).
                המידע יישמר באבטחה מלאה ולא יועבר לצדדים שלישיים ללא הסכמתי.
              </span>
            </label>

            {error && <div className="text-red-600 text-sm">{error}</div>}
            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="btn-ghost flex-1">חזור</button>
              <button
                onClick={submit}
                disabled={!data.consent || loading}
                className="btn-accent flex-1"
              >
                {loading ? 'יוצר...' : 'פתח תיק והמשך לשאלון ←'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text' }: any) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-[#01696f] focus:ring-2 focus:ring-teal-100"
      />
    </label>
  );
}

function Select({ label, value, onChange, options }: any) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#01696f]"
      >
        {options.map((o: any) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}
