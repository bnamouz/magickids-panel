'use client';

import { useEffect, useState, useMemo } from 'react';
import { VANDERBILT_PARENT_QUESTIONS, VANDERBILT_PARENT_INTRO_FIELDS, SCALE_A, SCALE_B, IntroField } from '@/questions/vanderbilt_parent';
import { CheckCircle2, ChevronRight, ChevronLeft, AlertCircle } from 'lucide-react';

const SECTIONS = [
  { id: 0, title: 'פרטים רקע', range: [0, 0], scale: 'INTRO' as const },
  { id: 1, title: 'חוסר קשב', range: [1, 9], scale: 'A' as const },
  { id: 2, title: 'היפראקטיביות / אימפולסיביות', range: [10, 18], scale: 'A' as const },
  { id: 3, title: 'התנהגות מתנגדת', range: [19, 26], scale: 'A' as const },
  { id: 4, title: 'הפרעות התנהגות', range: [27, 40], scale: 'A' as const },
  { id: 5, title: 'מצב רוח וחרדה', range: [41, 47], scale: 'A' as const },
  { id: 6, title: 'תפקוד אקדמי וחברתי', range: [48, 55], scale: 'B' as const },
];

type Responses = Record<number, number>;

export default function QuestionnaireForm({
  token,
  childName,
  initialResponses = {},
}: {
  token: string;
  childName: string;
  initialResponses?: Responses;
}) {
  const [responses, setResponses] = useState<Responses>(initialResponses);
  const [section, setSection] = useState(0);
  const [freeText, setFreeText] = useState('');
  const [introData, setIntroData] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentSection = SECTIONS[section];
  const isIntroSection = currentSection.scale === 'INTRO';
  const sectionQuestions = isIntroSection
    ? []
    : VANDERBILT_PARENT_QUESTIONS.filter(
        q => q.id >= currentSection.range[0] && q.id <= currentSection.range[1]
      );

  const totalAnswered = Object.keys(responses).length;
  const progress = (totalAnswered / 55) * 100;

  const introComplete = VANDERBILT_PARENT_INTRO_FIELDS.filter(f => f.required).every(
    f => (introData[f.id]?.trim() || '').length > 0 &&
      (f.otherField && introData[f.id] === 'other'
        ? (introData[f.otherField]?.trim() || '').length > 0
        : true),
  );

  const sectionAnswered = isIntroSection
    ? introComplete
    : sectionQuestions.every(q => responses[q.id] !== undefined);

  // Auto-save every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (Object.keys(responses).length > 0) saveProgress();
    }, 30_000);
    return () => clearInterval(interval);
  }, [responses, freeText]);

  // Save on section change
  useEffect(() => {
    if (Object.keys(responses).length > 0) saveProgress();
  }, [section]);

  async function saveProgress() {
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/questionnaire', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          type: 'vanderbilt_parent',
          responses,
          free_text: freeText,
          intro_data: introData,
        }),
      });
      if (!res.ok) throw new Error('save failed');
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2_000);
    } catch (e) {
      setSaveStatus('error');
    }
  }

  function setResponse(qid: number, value: number) {
    setResponses(prev => ({ ...prev, [qid]: value }));
  }

  async function handleSubmit() {
    if (totalAnswered < 55) {
      setError('יש לענות על כל השאלות לפני שליחה');
      return;
    }
    if (!introComplete) {
      setError('יש למלא את פרטי הרקע החובה');
      return;
    }
    try {
      const res = await fetch('/api/questionnaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          type: 'vanderbilt_parent',
          responses,
          free_text: freeText,
          intro_data: introData,
          complete: true,
        }),
      });
      if (!res.ok) throw new Error('submit failed');
      setSubmitted(true);
    } catch (e) {
      setError('שגיאה בשליחה. נסה שוב.');
    }
  }

  if (submitted) {
    return <SubmittedScreen token={token} childName={childName} />;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="card mb-6">
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="text-sm text-orange-600 font-semibold mb-1">שאלון הורה · Vanderbilt</div>
            <h1 className="text-2xl font-bold text-[#01696f]">
              שלב {section + 1} מתוך {SECTIONS.length}: {currentSection.title}
            </h1>
            <p className="text-sm text-slate-600 mt-1">עבור {childName}</p>
          </div>
          <SaveIndicator status={saveStatus} />
        </div>

        {/* Progress bar */}
        <div className="bg-slate-100 rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-gradient-to-l from-orange-400 to-[#01696f] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-xs text-slate-500 mt-2 flex justify-between">
          <span>{totalAnswered} / 55 שאלות</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>

      {/* Scale legend (only for question sections) */}
      {!isIntroSection && (
        <div className="card mb-6 bg-[#f0f9fa] border-r-4 border-r-[#01696f]">
          <div className="font-semibold text-[#01696f] mb-2">סולם הדירוג:</div>
          <div className="flex flex-wrap gap-2 text-sm">
            {(currentSection.scale === 'A' ? SCALE_A : SCALE_B).map(s => (
              <div key={s.value} className="bg-white px-3 py-1 rounded-full border border-slate-200">
                <span className="font-bold text-[#01696f]">{s.value}</span>
                <span className="text-slate-600 mr-2">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Intro fields */}
      {isIntroSection && (
        <div className="space-y-4 mb-6">
          <div className="card bg-[#fff7ed] border-r-4 border-r-orange-500">
            <p className="text-slate-700 text-sm leading-relaxed">
              לפני מילוי השאלון, אנא מלא/י מספר פרטים על המשפחה ועל הילד/ה. הפרטים הללו עוזרים לנו להעניק הערכה מדויקת יותר.
            </p>
          </div>
          {VANDERBILT_PARENT_INTRO_FIELDS.map(field => (
            <IntroFieldRow
              key={field.id}
              field={field}
              value={introData[field.id]}
              otherValue={field.otherField ? introData[field.otherField] : undefined}
              onChange={(v, other) => {
                setIntroData(prev => {
                  const next = { ...prev, [field.id]: v };
                  if (field.otherField) next[field.otherField] = other ?? '';
                  return next;
                });
              }}
            />
          ))}
        </div>
      )}

      {/* Questions */}
      {!isIntroSection && (
        <div className="space-y-3 mb-6">
          {sectionQuestions.map(q => (
            <QuestionRow
              key={q.id}
              id={q.id}
              text={q.text}
              scale={currentSection.scale === 'A' ? SCALE_A : SCALE_B}
              value={responses[q.id]}
              onChange={(v) => setResponse(q.id, v)}
            />
          ))}
        </div>
      )}

      {/* Free text on last section */}
      {section === SECTIONS.length - 1 && (
        <div className="card mb-6">
          <label className="block mb-3">
            <div className="font-semibold text-[#01696f] mb-1">משהו נוסף שחשוב לנו לדעת? (אופציונלי)</div>
            <div className="text-sm text-slate-600 mb-3">
              שתפו אותנו בקשיים, חוזקות או כל מידע נוסף על הילד.
            </div>
            <textarea
              className="w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:border-[#01696f] focus:ring-2 focus:ring-teal-100"
              rows={4}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="הקלד כאן..."
            />
          </label>
        </div>
      )}

      {error && (
        <div className="card border-r-4 border-r-red-500 bg-red-50 mb-6 flex gap-3 items-start">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
          <div className="text-red-700">{error}</div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between gap-3">
        <button
          onClick={() => setSection(s => Math.max(0, s - 1))}
          disabled={section === 0}
          className="btn-ghost flex items-center gap-2"
        >
          <ChevronRight size={20} /> חזור
        </button>

        {section < SECTIONS.length - 1 ? (
          <button
            onClick={() => setSection(s => s + 1)}
            disabled={!sectionAnswered}
            className="btn-primary flex items-center gap-2"
          >
            הבא <ChevronLeft size={20} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={totalAnswered < 55 || !introComplete}
            className="btn-accent flex items-center gap-2"
          >
            <CheckCircle2 size={20} /> שלח שאלון
          </button>
        )}
      </div>
    </div>
  );
}

function QuestionRow({
  id, text, scale, value, onChange,
}: {
  id: number;
  text: string;
  scale: { value: number; label: string }[];
  value?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="card hover:shadow-md transition">
      <div className="flex gap-3 mb-3">
        <span className="bg-[#01696f] text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
          {id}
        </span>
        <p className="text-slate-800 leading-relaxed">{text}</p>
      </div>
      <div className="flex flex-wrap gap-2 mr-10">
        {scale.map(s => (
          <button
            key={s.value}
            onClick={() => onChange(s.value)}
            className={`px-4 py-2 rounded-lg border-2 transition text-sm font-medium ${
              value === s.value
                ? 'bg-[#01696f] text-white border-[#01696f] shadow-md'
                : 'bg-white text-slate-700 border-slate-300 hover:border-[#01696f]'
            }`}
          >
            {s.value} · {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function IntroFieldRow({
  field,
  value,
  otherValue,
  onChange,
}: {
  field: IntroField;
  value?: string;
  otherValue?: string;
  onChange: (v: string, other?: string) => void;
}) {
  return (
    <div className="card">
      <label className="block">
        <div className="font-semibold text-slate-800 mb-3">
          {field.label}
          {field.required && <span className="text-red-500 mr-1">*</span>}
        </div>

        {field.type === 'radio' && field.options && (
          <div className="flex flex-wrap gap-2">
            {field.options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange(opt.value, otherValue)}
                className={`px-4 py-2 rounded-lg border-2 transition text-sm font-medium ${
                  value === opt.value
                    ? 'bg-[#01696f] text-white border-[#01696f] shadow-md'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-[#01696f]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {field.type === 'radio' && value === 'other' && field.otherField && (
          <input
            type="text"
            className="mt-3 w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:border-[#01696f] focus:ring-2 focus:ring-teal-100"
            placeholder="פרט/י..."
            value={otherValue || ''}
            onChange={e => onChange(value, e.target.value)}
          />
        )}

        {field.type === 'text' && (
          <input
            type="text"
            className="w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:border-[#01696f] focus:ring-2 focus:ring-teal-100"
            placeholder={field.placeholder}
            value={value || ''}
            onChange={e => onChange(e.target.value)}
          />
        )}

        {field.type === 'textarea' && (
          <textarea
            rows={3}
            className="w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:border-[#01696f] focus:ring-2 focus:ring-teal-100"
            placeholder={field.placeholder}
            value={value || ''}
            onChange={e => onChange(e.target.value)}
          />
        )}
      </label>
    </div>
  );
}

function SaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null;
  const map = {
    saving: { text: 'שומר...', cls: 'text-slate-500' },
    saved: { text: '✓ נשמר', cls: 'text-green-600' },
    error: { text: 'שגיאת שמירה', cls: 'text-red-600' },
  };
  return <div className={`text-sm font-medium ${map[status].cls}`}>{map[status].text}</div>;
}

function SubmittedScreen({ token, childName }: { token: string; childName: string }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="card text-center">
        <CheckCircle2 className="text-green-500 mx-auto mb-4" size={64} />
        <h1 className="text-3xl font-bold text-[#01696f] mb-3">תודה רבה!</h1>
        <p className="text-lg text-slate-700 mb-6">
          השאלון של {childName} נשלח בהצלחה.
        </p>
        <div className="bg-[#fff7ed] border-r-4 border-r-orange-500 p-4 rounded text-right mb-6">
          <div className="font-bold text-orange-700 mb-2">השלב הבא: שאלון המורה</div>
          <p className="text-slate-700">
            עכשיו נצטרך גם את חוות הדעת של המורה. שלחו את הקישור הבא ישירות למורה,
            התשובות יישלחו אלינו אוטומטית – אינכם תראו את התשובות (כדי לשמור על אובייקטיביות).
          </p>
        </div>
        <a
          href={`/share-teacher/${token}`}
          className="btn-accent inline-block"
        >
          לקבלת קישור עבור המורה ←
        </a>
      </div>
    </div>
  );
}
