'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Search, X } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: '', label: 'הכול' },
  { value: 'parent_form_started', label: 'הורה ממלא' },
  { value: 'parent_form_done', label: 'הורה השלים' },
  { value: 'teacher_link_sent', label: 'ממתין למורה' },
  { value: 'teacher_form_started', label: 'מורה ממלאה' },
  { value: 'profile_ready', label: 'מוכן לזימון' },
  { value: 'scheduled', label: 'תור נקבע' },
  { value: 'reported', label: 'הושלם' },
];

export default function SessionFilters({
  current,
}: {
  current: { q?: string; status?: string; filter?: string };
}) {
  const router = useRouter();
  const [q, setQ] = useState(current.q ?? '');

  function updateQuery(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const next = { ...current, ...patch };
    Object.entries(next).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    router.push(`/admin/sessions?${params.toString()}`);
  }

  return (
    <div className="card mb-4 flex flex-wrap gap-3 items-center">
      <div className="relative flex-1 min-w-[220px]">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') updateQuery({ q: q || undefined });
          }}
          placeholder="חיפוש שם ילד, הורה או טלפון..."
          className="w-full border border-slate-300 rounded-lg pr-10 pl-3 py-2 focus:outline-none focus:border-[#01696f]"
        />
      </div>

      <select
        value={current.status ?? ''}
        onChange={(e) => updateQuery({ status: e.target.value || undefined })}
        className="border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-[#01696f] bg-white"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <button
        onClick={() => updateQuery({ filter: current.filter === 'stuck' ? undefined : 'stuck' })}
        className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
          current.filter === 'stuck'
            ? 'bg-orange-500 text-white'
            : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
        }`}
      >
        רק תקועים (3+ ימים)
      </button>

      {(current.q || current.status || current.filter) && (
        <button
          onClick={() => router.push('/admin/sessions')}
          className="text-slate-500 hover:text-slate-700 flex items-center gap-1 text-sm"
        >
          <X size={16} /> נקה
        </button>
      )}
    </div>
  );
}
