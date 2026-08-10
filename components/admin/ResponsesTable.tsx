'use client';

import { useState } from 'react';
import { VANDERBILT_PARENT_QUESTIONS } from '@/questions/vanderbilt_parent';
import { VANDERBILT_TEACHER_QUESTIONS } from '@/questions/vanderbilt_teacher';

export default function ResponsesTable({
  parentQ,
  teacherQ,
}: {
  parentQ: any;
  teacherQ: any;
}) {
  const [tab, setTab] = useState<'parent' | 'teacher'>(parentQ ? 'parent' : 'teacher');

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {parentQ && (
          <TabButton active={tab === 'parent'} onClick={() => setTab('parent')}>
            הורה ({Object.keys(parentQ.responses ?? {}).length} תשובות)
          </TabButton>
        )}
        {teacherQ && (
          <TabButton active={tab === 'teacher'} onClick={() => setTab('teacher')}>
            מורה ({Object.keys(teacherQ.responses ?? {}).length} תשובות)
          </TabButton>
        )}
      </div>

      {tab === 'parent' && parentQ && (
        <QuestionsList
          questions={VANDERBILT_PARENT_QUESTIONS}
          responses={parentQ.responses ?? {}}
          freeText={parentQ.free_text}
        />
      )}
      {tab === 'teacher' && teacherQ && (
        <QuestionsList
          questions={VANDERBILT_TEACHER_QUESTIONS}
          responses={teacherQ.responses ?? {}}
          freeText={teacherQ.free_text}
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold transition ${
        active ? 'text-[#01696f] border-b-2 border-[#01696f]' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function QuestionsList({
  questions,
  responses,
  freeText,
}: {
  questions: any[];
  responses: Record<number, number>;
  freeText?: string;
}) {
  return (
    <div>
      <div className="space-y-1 max-h-96 overflow-y-auto pr-2">
        {questions.map((q) => {
          const val = responses[q.id];
          const highlighted = val >= 2;
          return (
            <div
              key={q.id}
              className={`flex justify-between items-start text-sm p-2 rounded ${
                highlighted ? 'bg-red-50' : ''
              }`}
            >
              <div className="flex-1">
                <span className="text-slate-400 text-xs ml-1">{q.id}.</span>
                <span className="text-slate-700">{q.text}</span>
              </div>
              <span
                className={`font-bold ml-2 flex-shrink-0 w-8 text-center ${
                  val === undefined ? 'text-slate-300' : highlighted ? 'text-red-600' : 'text-slate-700'
                }`}
              >
                {val === undefined ? '—' : val}
              </span>
            </div>
          );
        })}
      </div>

      {freeText && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="font-semibold text-slate-700 text-sm mb-1">הערות חופשיות:</div>
          <p className="text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 p-3 rounded">{freeText}</p>
        </div>
      )}
    </div>
  );
}
