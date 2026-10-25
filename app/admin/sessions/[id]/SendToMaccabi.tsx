'use client';

import { useEffect, useState } from 'react';
import { Loader2, Mail, Paperclip, CheckCircle2, AlertCircle, X } from 'lucide-react';

interface Props { sessionId: string; childName: string; nationalId: string | null; canSend: boolean }
interface ReportRow { id: string; status: string; created_at: string; pdf_storage_path: string | null }

const MACCABI_EMAIL = 'MokedMhuziYld@mac.org.il';
const ACCEPT = 'application/pdf,image/jpeg,image/png';
const MAX_FILE = 15 * 1024 * 1024, MAX_TOTAL = 20 * 1024 * 1024, MAX_FILES = 10;
const ERRORS: Record<string, string> = {
  forbidden: 'אין הרשאה לשליחת מסמכים (מנהל/מאבחן בלבד).', no_files: 'יש לבחור לפחות קובץ אחד.', too_many_files: `אפשר לשלוח עד ${MAX_FILES} קבצים בהודעה.`,
  too_large: 'הקבצים גדולים מדי (עד 15MB לקובץ ו־20MB בסך הכול).', file_too_large: 'קובץ גדול מדי (עד 15MB).', unsupported_type: 'סוג קובץ לא נתמך – PDF, JPG או PNG בלבד.',
  report_missing: 'אחד הדוחות שנבחרו חסר קובץ PDF.', file_missing: 'אחד הקבצים לא נמצא – נסו להעלות שוב.', mail_not_configured: 'שליחת מייל אינה מוגדרת במערכת.',
  send_failed: 'השליחה למייל נכשלה – נסו שוב בעוד רגע.', storage_unavailable: 'אחסון הקבצים אינו זמין כרגע.', upload_failed: 'העלאת הקובץ נכשלה.', not_found: 'התיק לא נמצא.',
};

export default function SendToMaccabi({ sessionId, childName, nationalId, canSend }: Props) {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState('');
  const [recipient, setRecipient] = useState<'maccabi' | 'self'>('maccabi');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ to: string; files: string[] } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/reports/list?session_id=${sessionId}`, { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json()).then((d) => setReports((d.reports || []).filter((r: ReportRow) => r.pdf_storage_path))).catch(() => {});
  }, [sessionId]);

  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  const count = selected.length + files.length;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!ACCEPT.split(',').includes(f.type)) { setError(ERRORS.unsupported_type); continue; }
      if (f.size > MAX_FILE) { setError(ERRORS.file_too_large); continue; }
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    setFiles(next.slice(0, MAX_FILES));
  }

  async function send() {
    setError(null); setDone(null);
    if (count === 0) return setError(ERRORS.no_files);
    if (count > MAX_FILES) return setError(ERRORS.too_many_files);
    if (totalBytes > MAX_TOTAL) return setError(ERRORS.too_large);
    const target = recipient === 'self' ? 'למייל של המכון (בדיקה)' : `למכבי – מוקד מחוזי ילדים (${MACCABI_EMAIL})`;
    if (!confirm(`לשלוח ${count} קבצים של ${childName} ${target}?`)) return;
    try {
      const uploads: { path: string; filename: string }[] = [];
      for (const [i, f] of files.entries()) {
        setBusy(`מעלה קובץ ${i + 1} מתוך ${files.length}…`);
        const r = await fetch(`/api/admin/sessions/${sessionId}/maccabi`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: f.name, type: f.type, size: f.size }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'upload_failed');
        const form = new FormData(); form.append('cacheControl', '3600'); form.append('', f);
        const up = await fetch(d.signedUrl, { method: 'PUT', body: form, headers: d.apikey ? { apikey: d.apikey } : {} });
        if (!up.ok) throw new Error('upload_failed');
        uploads.push({ path: d.path, filename: f.name });
      }
      setBusy('שולח מייל…');
      const r = await fetch(`/api/admin/sessions/${sessionId}/maccabi`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ report_ids: selected, uploads, note: note.trim() || undefined, recipient }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'send_failed');
      setDone({ to: d.to, files: d.files }); setSelected([]); setFiles([]); setNote('');
    } catch (e) {
      const m = e instanceof Error ? e.message : 'send_failed';
      setError(ERRORS[m] || `שגיאה: ${m}`);
    } finally { setBusy(null); }
  }

  if (!canSend) return null;
  return (
    <div className="card">
      <h2 className="font-bold text-slate-800 mb-1 flex items-center gap-2"><Mail size={18} className="text-[#01696f]" /> שליחת קבצים למכבי</h2>
      <p className="text-xs text-slate-500 mb-3">נשלח במייל מהכתובת magickids@magickidsinstitute.com אל מוקד מחוזי ילדים – <span dir="ltr">{MACCABI_EMAIL}</span>. הנושא כולל את שם הילד/ה{nationalId ? ' ומספר ת.ז.' : ''}. PDF / JPG / PNG, עד 10 קבצים ו־20MB.</p>
      {!nationalId && <p className="text-xs text-amber-700 mb-3">ת.ז. של הילד/ה חסרה בתיק – מומלץ להשלים לפני השליחה למכבי.</p>}

      {reports.length > 0 && (
        <div className="mb-3">
          <p className="text-sm font-semibold text-slate-700 mb-1">דוחות מהמערכת</p>
          <div className="space-y-1">
            {reports.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={selected.includes(r.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, r.id] : selected.filter((x) => x !== r.id))} />
                דוח אבחון מ־{new Date(r.created_at).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#01696f] cursor-pointer border border-dashed border-[#01696f] rounded-lg px-3 py-2 hover:bg-teal-50">
          <Paperclip size={16} /> הוספת קבצים מהמחשב
          <input type="file" className="hidden" multiple accept={ACCEPT} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </label>
        {files.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {files.map((f) => (
              <li key={`${f.name}-${f.size}`} className="flex items-center gap-2">
                <button type="button" aria-label="הסרה" className="text-slate-400 hover:text-red-600" onClick={() => setFiles(files.filter((x) => x !== f))}><X size={14} /></button>
                <span className="truncate" dir="auto">{f.name}</span><span className="text-xs text-slate-400">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <textarea className="w-full border rounded-lg p-2 text-sm mb-3" rows={2} placeholder="הערה למכבי (לא חובה)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy !== null || count === 0} onClick={send} className="inline-flex items-center gap-2 bg-[#01696f] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} {busy ?? (recipient === 'self' ? 'שליחת בדיקה למייל המכון' : `שליחה למכבי (${count})`)}
        </button>
        <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={recipient === 'self'} onChange={(e) => setRecipient(e.target.checked ? 'self' : 'maccabi')} /> שליחת בדיקה אליי במקום למכבי</label>
      </div>

      {error && <p className="mt-3 text-sm text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</p>}
      {done && <p className="mt-3 text-sm text-green-700 flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5" /> <span>נשלח אל <span dir="ltr">{done.to}</span>: {done.files.join(' · ')}</span></p>}
    </div>
  );
}
