'use client';

import { useEffect, useState } from 'react';
import { VANDERBILT_TEACHER_QUESTIONS } from '@/questions/vanderbilt_teacher';
import { SCALE_A, SCALE_B } from '@/questions/vanderbilt_parent';
import { CheckCircle2, ChevronRight, ChevronLeft, AlertCircle, ShieldCheck } from 'lucide-react';

const SECTIONS = [
  { id: 1, title: 'חוסר קשב', range: [1, 9], scale: 'A' as const },
  { id: 2, title: 'היפראקטיביות / אימפולסיביות', range: [10, 18], scale: 'A' as const },
  { id: 3, title: 'התנגדות והתנהגות', range: [19, 26], scale: 'A' as const },
  { id: 4, title: 'מצב רוח וחרדה', range: [27, 35], scale: 'A' as const },
  { id: 5, title: 'תפקוד אקדמי', range: [36, 38], scale: 'B' as const },
  { id: 6, title: 'תפקוד התנהגותי בכיתה', range: [39, 43], scale: 'B' as const },
];

const TOTAL_QUESTIONS = 43;

type Responses = Record<number, number>;

export default function TeacherQuestionnaireForm({
  token,
  childName,
  teacherName,
  initialResponses = {},
}: {
  token: string;
  childName: string;
  teacherName?: string;
  initialResponses?: Responses;
}) {
  const [responses, setResponses] = useState<Responses>(initialResponses);
  const [section, setSection] = useState(0);
  const [freeText, setFreeText] = useState('');
  const [respondentName, setRespondentName] = useState(teacherName ?? '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentSection = SECTIONS[section];
  const sectionQuestions = VANDERBILT_TEACHER_QUESTIONS.filter(
    q => q.id >= currentSection.range[0] && q.id <= currentSection.range[1]
  );

  const totalAnswered = Object.keys(responses).length;
  const progress = (totalAnswered / TOTAL_QUESTIONS) * 100;
  const sectionAnswered = sectionQuestions.every(q => responses[q.id] !== undefined);

  // Auto-save
  useEffect(() => {
    const interval = setInterval(() => {
      if (Object.keys(responses).length > 0) saveProgress();
    }, 30_000);
    return () => clearInterval(interval);
  }, [responses, freeText]);

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
          type: 'vanderbilt_teacher',
          responses,
          free_text: freeText,
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
    if (totalAnswered < TOTAL_QUESTIONS) {
      setError(`יש למלא את כל ${TOTAL_QUESTIONS} השאלות לפני שליחה (מולאו ${totalAnswered})`);
      return;
    }
    if (!respondentName.trim()) {
      setError('יש להזין את שם המורה');
      return;
    }
    try {
      const res = await fetch('/api/questionnaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          type: 'vanderbilt_teacher',
          responses,
          free_text: `[Filled by: ${respondentName}]\n${freeText}`,
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
    return <TeacherSubmittedScreen childName={childName} />;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6" dir="rtl">
      {/* Privacy banner */}
      <div className="card mb-4 bg-[#fff7ed] border-r-4 border-r-orange-500 flex gap-3">
        <ShieldCheck className="text-orange-600 flex-shrink-0 mt-0.5" size={22} />
        <div className="text-sm text-slate-700 leading-relaxed">
          <strong className="text-orange-700">פרטיות:</strong> תשובותייך נשלחות ישירות למכון ילדי הקסם
          ולא יוצגו להורי הילד. אנא ענה בכנות ובאובייקטיביות, על סמך התנהגות הילד בכיתה ב-6 החודשים האחרונים.
        </div>
      </div>

      {/* Header */}
      <div className="card mb-6">
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="text-sm text-orange-600 font-semibold mb-1">שאלון מורה · Vanderbilt</div>
            <h1 className="text-2xl font-bold text-[#01696f]">
              שלב {section + 1} מתוך {SECTIONS.length}: {currentSection.title}
            </h1>
            <p className="text-sm text-slate-600 mt-1">עבור {childName}</p>
          </div>
          <SaveIndicator status={saveStatus} />
        </div>

        <div className="bg-slate-100 rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-gradient-to-l from-orange-400 to-[#01696f] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-xs text-slate-500 mt-2 flex justify-between">
          <span>{totalAnswered} / {TOTAL_QUESTIONS} שאלות</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>

      {/* Teacher name (first section) */}
      {section === 0 && (
        <div className="card mb-6">
          <label className="block">
            <div className="font-semibold text-[#01696f] mb-2">שם המורה הממלא/ת *</div>
            <input
              type="text"
              value={respondentName}
              onChange={(e) => setRespondentName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:border-[#01696f] focus:ring-2 focus:ring-teal-100"
              placeholder="שם פרטי ומשפחה"
            />
          </label>
        </div>
      )}

      {/* Scale legend */}
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

      {/* Questions */}
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

      {/* Free text on last section */}
      {section === SECTIONS.length - 1 && (
        <div className="card mb-6">
          <label className="block mb-3">
            <div className="font-semibold text-[#01696f] mb-1">הערות נוספות (אופציונלי)</div>
            <div className="text-sm text-slate-600 mb-3">
              חוזקות, אסטרטגיות שעובדות, התאמות קיימות, או כל מידע נוסף שחשוב לאבחון.
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
            disabled={!sectionAnswered || (section === 0 && !respondentName.trim())}
            className="btn-primary flex items-center gap-2"
          >
            הבא <ChevronLeft size={20} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={totalAnswered < TOTAL_QUESTIONS}
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

function SaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null;
  const map = {
    saving: { text: 'שומר...', cls: 'text-slate-500' },
    saved: { text: '✓ נשמר', cls: 'text-green-600' },
    error: { text: 'שגיאת שמירה', cls: 'text-red-600' },
  };
  return <div className={`text-sm font-medium ${map[status].cls}`}>{map[status].text}</div>;
}

function TeacherSubmittedScreen({ childName }: { childName: string }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12" dir="rtl">
      <div className="card text-center">
        <CheckCircle2 className="text-green-500 mx-auto mb-4" size={64} />
        <h1 className="text-3xl font-bold text-[#01696f] mb-3">תודה רבה!</h1>
        <p className="text-lg text-slate-700 mb-4">
          השאלון על {childName} נשלח בהצלחה למכון ילדי הקסם.
        </p>
        <p className="text-slate-600 text-sm">
          ההורים לא יראו את תשובותייך. הצוות הקליני יעבד את הנתונים יחד עם שאלון ההורה ויבנה דוח אבחון מלא.
        </p>
        <p className="text-slate-500 text-xs mt-6">
          ניתן לסגור חלון זה.
        </p>
      </div>
    </div>
  );
}
