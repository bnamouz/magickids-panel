'use client';

import { useState, useEffect } from 'react';
import { FileText, Download, Loader2, Sparkles, CheckCircle2, AlertCircle, Send } from 'lucide-react';

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

export default function GenerateReport({ sessionId, childName, hasParentForm }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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
      console.log('[GenerateReport] loaded', data.reports?.length ?? 0, 'reports');
    } catch (e: any) {
      console.error('[GenerateReport] load error:', e);
      setError(`שגיאה בטעינת דוחות: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) loadReports();
  }, [open]);

  async function handleGenerate() {
    if (!confirm(`להפיק דוח אבחון עבור ${childName}?\nהפעולה משתמשת ב-GPT-4o ולוקחת ~30-60 שניות.`)) return;

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
        `לשלוח דוח זה להורה של ${childName} דרך WhatsApp?\n\n` +
          `הפעולה תשלח את קובץ ה-PDF בצירוף הודעת ליווי לטלפון ההורה הרשום בתיק.\n` +
          `לאחר השליחה סטטוס הדוח יעודכן ל'נשלח'.`,
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
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok) throw new Error(data.error || `שליחה נכשלה (HTTP ${res.status})`);

      setSuccessMsg(`הדוח נשלח בהצלחה ל-${data.sent_to} ב-WhatsApp`);
      await loadReports();
    } catch (e: any) {
      console.error('[send-whatsapp] error:', e);
      setError(`שליחת WhatsApp נכשלה: ${e.message}`);
    } finally {
      setSendingId(null);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!hasParentForm}
        title={!hasParentForm ? 'צריך שאלון הורה מלא לפני הפקת דוח' : 'הפקת דוח אבחון'}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#01696f] text-white font-semibold hover:bg-[#014a4f] disabled:bg-slate-300 disabled:cursor-not-allowed text-sm"
      >
        <FileText size={16} />
        הפקת דוח
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <Sparkles size={22} className="text-[#01696f]" /> דוחות אבחון
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  דוח PDF בעברית המבוסס על שאלוני Vanderbilt + הערות קליניות
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
                ×
              </button>
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

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full mb-6 py-3 rounded-lg bg-gradient-to-r from-[#01696f] to-[#0d8891] text-white font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {generating ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  מייצר דוח... (עד 60 שניות)
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  הפק דוח חדש
                </>
              )}
            </button>

            <div>
              <h3 className="font-bold text-slate-700 mb-3">היסטוריית דוחות</h3>
              {loading ? (
                <div className="text-center py-6 text-slate-500">טוען...</div>
              ) : reports.length === 0 ? (
                <div className="text-center py-6 text-slate-500 border border-dashed border-slate-200 rounded-lg">
                  טרם הופק דוח לתיק זה
                </div>
              ) : (
                <ul className="space-y-2">
                  {reports.map((r) => {
                    const generatedAt = r.generated_at || r.created_at;
                    const statusColor: Record<string, string> = {
                      draft: 'bg-amber-50 text-amber-700',
                      reviewed: 'bg-blue-50 text-blue-700',
                      finalized: 'bg-green-50 text-green-700',
                      sent: 'bg-purple-50 text-purple-700',
                    };
                    const statusLabel: Record<string, string> = {
                      draft: 'טיוטה',
                      reviewed: 'נבדק',
                      finalized: 'סופי',
                      sent: 'נשלח',
                    };
                    return (
                      <li key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-[#01696f] transition">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">
                            {new Date(generatedAt).toLocaleString('he-IL', {
                              timeZone: 'Asia/Jerusalem',
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded ${statusColor[r.status] || 'bg-slate-100 text-slate-700'}`}>
                              {statusLabel[r.status] || r.status}
                            </span>
                            {r.ai_model && (
                              <span className="text-xs text-slate-400">{r.ai_model}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={downloadUrl(r.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#01696f] text-white text-sm font-semibold hover:bg-[#014a4f]"
                          >
                            <Download size={14} />
                            הורדה
                          </a>
                          {r.status !== 'sent' && r.pdf_storage_path && (
                            <button
                              onClick={() => handleSendWhatsApp(r.id)}
                              disabled={sendingId === r.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-60"
                              title="שלח PDF להורה דרך WhatsApp"
                            >
                              {sendingId === r.id ? (
                                <>
                                  <Loader2 size={14} className="animate-spin" />
                                  שולח...
                                </>
                              ) : (
                                <>
                                  <Send size={14} />
                                  שלח בוואטסאפ
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
