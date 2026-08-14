'use client';

import { useState, useEffect } from 'react';
import { FileText, Download, Loader2, Sparkles, CheckCircle2, AlertCircle, Send, RefreshCw } from 'lucide-react';

interface Props {
  sessionId: string;
  childName: string;
  hasParentForm: boolean;
}

interface ReportRow {
  id: string;
  status: string;
  ai_model: string | null;
  generated_at: string | null;
  created_at: string;
  pdf_storage_path: string | null;
}

export default function ReportsList({ sessionId, childName, hasParentForm }: Props) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  async function loadReports() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reports/list?session_id=${sessionId}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok) throw new Error(data.error || `שגיאה בטעינת דוחות (HTTP ${res.status})`);
      setReports(data.reports || []);
    } catch (e: any) {
      setError(`שגיאה בטעינת דוחות: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, [sessionId]);

  async function handleGenerate() {
    if (!confirm(`להפיק דוח אבחון חדש עבור ${childName}?\nהפעולה משתמשת ב-GPT-4o ולוקחת ~30-60 שניות.`)) return;

    setGenerating(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/admin/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה ביצירת הדוח');

      setSuccessMsg(`הדוח נוצר בהצלחה (${Math.round((data.file_size || 0) / 1024)} KB)`);
      await loadReports();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  function downloadUrl(reportId: string) {
    return `/api/admin/reports/${reportId}/download`;
  }

  async function handleSendWhatsApp(reportId: string) {
    if (
      !confirm(
        `לפתוח WhatsApp עם דוח ל-${childName}?\n\n` +
          `המערכת תיצור קישור הורדה (תוקף 7 ימים), תפתח את WhatsApp עם מספר ההורה והודעה מוכנה — אתה רק לוחץ שלח.\n\n` +
          `הסטטוס יעודכן ל'נשלח'.`,
      )
    ) return;

    setSendingId(reportId);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/admin/reports/${reportId}/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה ביצירת קישור וואטסאפ');

      if (data.wa_link) {
        window.open(data.wa_link, '_blank');
        setSuccessMsg('WhatsApp נפתח — לחץ שלח בתוך WhatsApp');
      }
      await loadReports();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSendingId(null);
    }
  }

  const statusColor: Record<string, string> = {
    draft: 'bg-amber-50 text-amber-700 border-amber-200',
    reviewed: 'bg-blue-50 text-blue-700 border-blue-200',
    finalized: 'bg-green-50 text-green-700 border-green-200',
    sent: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  const statusLabel: Record<string, string> = {
    draft: 'טיוטה',
    reviewed: 'נבדק',
    finalized: 'סופי',
    sent: 'נשלח',
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-slate-800 flex items-center gap-2">
          <Sparkles size={18} className="text-[#01696f]" /> דוחות אבחון
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={loadReports}
            disabled={loading}
            title="רענון"
            className="text-slate-400 hover:text-[#01696f] disabled:opacity-40"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleGenerate}
            disabled={!hasParentForm || generating}
            title={!hasParentForm ? 'צריך שאלון הורה מלא לפני הפקת דוח' : 'הפקת דוח אבחון חדש'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#01696f] text-white text-sm font-semibold hover:bg-[#014a4f] disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                מפיק... (עד 60 שניות)
              </>
            ) : (
              <>
                <Sparkles size={14} />
                הפק דוח חדש
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm flex items-start gap-2">
          <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-6 text-slate-500">טוען דוחות...</div>
      ) : reports.length === 0 ? (
        <div className="text-center py-8 text-slate-500 border border-dashed border-slate-200 rounded-lg">
          <FileText size={32} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm">טרם הופק דוח לתיק זה</p>
          {hasParentForm && (
            <p className="text-xs mt-1">לחץ "הפק דוח חדש" למעלה</p>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => {
            const generatedAt = r.generated_at || r.created_at;
            return (
              <li
                key={r.id}
                className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-[#01696f] hover:bg-teal-50/30 transition"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800">
                    {new Date(generatedAt).toLocaleString('he-IL', {
                      timeZone: 'Asia/Jerusalem',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span
                      className={`text-xs px-2 py-0.5 rounded border ${
                        statusColor[r.status] || 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {statusLabel[r.status] || r.status}
                    </span>
                    {r.ai_model && (
                      <span className="text-xs text-slate-400">{r.ai_model}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a
                    href={downloadUrl(r.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#01696f] text-white text-sm font-semibold hover:bg-[#014a4f]"
                  >
                    <Download size={14} />
                    הורדה
                  </a>
                  {r.pdf_storage_path && (
                    <button
                      onClick={() => handleSendWhatsApp(r.id)}
                      disabled={sendingId === r.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-60"
                      title="שלח דוח ב-WhatsApp להורה"
                    >
                      {sendingId === r.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Send size={14} />
                      )}
                      WhatsApp
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
