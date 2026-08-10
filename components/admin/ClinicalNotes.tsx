'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Send, Loader2 } from 'lucide-react';

export default function ClinicalNotes({
  sessionId,
  notes,
  currentStaffId,
}: {
  sessionId: string;
  notes: any[];
  currentStaffId: string;
}) {
  const router = useRouter();
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<'general' | 'clinical' | 'follow_up' | 'flag'>('general');
  const [loading, setLoading] = useState(false);

  async function addNote() {
    if (!content.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, content, category }),
      });
      if (!res.ok) throw new Error('failed');
      setContent('');
      router.refresh();
    } catch {
      alert('שגיאה בשמירת ההערה');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
        <MessageSquare size={18} className="text-[#01696f]" /> הערות קליניות
      </h2>

      {/* Add new */}
      <div className="mb-6 space-y-2">
        <div className="flex gap-2 items-center flex-wrap">
          {(['general', 'clinical', 'follow_up', 'flag'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`text-xs px-3 py-1 rounded-full transition ${
                category === c ? 'bg-[#01696f] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="הקלד/י הערה קלינית..."
          className="w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:border-[#01696f] text-sm"
        />
        <button
          onClick={addNote}
          disabled={!content.trim() || loading}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
          שמור הערה
        </button>
      </div>

      {/* List */}
      {notes.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">טרם נוספו הערות</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className={`border-r-4 pr-3 py-2 ${CATEGORY_COLORS[n.category] ?? 'border-r-slate-300'}`}>
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {CATEGORY_LABELS[n.category] ?? n.category}
                  </span>
                  <span className="text-xs text-slate-500">{n.staff_users?.full_name}</span>
                </div>
                <span className="text-xs text-slate-400">
                  {new Date(n.created_at).toLocaleString('he-IL')}
                </span>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  general: 'כללי',
  clinical: 'קליני',
  follow_up: 'מעקב',
  flag: 'דגל אדום',
};

const CATEGORY_COLORS: Record<string, string> = {
  general: 'border-r-slate-300',
  clinical: 'border-r-[#01696f]',
  follow_up: 'border-r-blue-400',
  flag: 'border-r-red-500 bg-red-50',
};
