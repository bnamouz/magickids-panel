'use client';

import { useState } from 'react';
import { Copy, MessageCircle, Mail, Check, ShieldCheck, Loader2 } from 'lucide-react';

interface Props {
  parentToken: string;
  childName: string;
  existingTeacherUrl: string | null;
  existingTeacherInfo: {
    name: string;
    phone: string;
    email: string;
    status: string;
  } | null;
}

export default function ShareTeacherClient({
  parentToken,
  childName,
  existingTeacherUrl,
  existingTeacherInfo,
}: Props) {
  const [teacherName, setTeacherName] = useState(existingTeacherInfo?.name ?? '');
  const [teacherPhone, setTeacherPhone] = useState(existingTeacherInfo?.phone ?? '');
  const [teacherEmail, setTeacherEmail] = useState(existingTeacherInfo?.email ?? '');
  const [teacherUrl, setTeacherUrl] = useState<string | null>(existingTeacherUrl);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teacherDone =
    existingTeacherInfo?.status === 'teacher_form_done' ||
    existingTeacherInfo?.status === 'profile_ready';

  async function generateLink() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/teacher-questionnaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_token: parentToken,
          teacher_name: teacherName || undefined,
          teacher_phone: teacherPhone || undefined,
          teacher_email: teacherEmail || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      setTeacherUrl(data.teacher_url);
      setWhatsappUrl(data.whatsapp_url);
      setShareMessage(data.share_message);
    } catch (e: any) {
      setError(e.message ?? 'שגיאה ביצירת הקישור');
    } finally {
      setLoading(false);
    }
  }

  async function copyUrl() {
    if (!teacherUrl) return;
    await navigator.clipboard.writeText(teacherUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyMessage() {
    if (!shareMessage) return;
    await navigator.clipboard.writeText(shareMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (teacherDone) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12" dir="rtl">
        <div className="card text-center">
          <Check className="text-green-500 mx-auto mb-4" size={64} />
          <h1 className="text-3xl font-bold text-[#01696f] mb-3">תהליך השאלונים הושלם</h1>
          <p className="text-slate-700 mb-4">
            המורה כבר השלים/ה את השאלון. הצוות הקליני יחזור אליכם בקרוב לתיאום פגישת אבחון.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8" dir="rtl">
      <div className="card mb-6">
        <h1 className="text-2xl font-bold text-[#01696f] mb-2">קישור עבור המורה של {childName}</h1>
        <p className="text-slate-700 leading-relaxed">
          בשלב זה אנחנו זקוקים לחוות דעת מהמורה. <strong>הקישור שתיצרו יישלח ישירות אליכם להעברה למורה</strong>.
          המורה תמלא ישירות והתשובות יגיעו אלינו – לא יעברו דרככם, כדי לשמור על אובייקטיביות.
        </p>
      </div>

      <div className="card mb-6 bg-[#fff7ed] border-r-4 border-r-orange-500 flex gap-3">
        <ShieldCheck className="text-orange-600 flex-shrink-0 mt-0.5" size={22} />
        <div className="text-sm text-slate-700">
          <strong className="text-orange-700">חשוב לדעת:</strong> לא תוכלו לראות את התשובות של המורה.
          הצוות הקליני שלנו יעבד את הנתונים יחד עם השאלון שלכם ויציג לכם תמונה כוללת בפגישת האבחון.
        </div>
      </div>

      {!teacherUrl ? (
        <div className="card mb-6">
          <h2 className="font-bold text-[#01696f] mb-4">פרטי המורה (אופציונלי, יקל על השליחה)</h2>
          <div className="space-y-4">
            <label className="block">
              <div className="text-sm text-slate-700 mb-1">שם המורה</div>
              <input
                type="text"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:border-[#01696f]"
                placeholder="שם פרטי ומשפחה"
              />
            </label>
            <label className="block">
              <div className="text-sm text-slate-700 mb-1">טלפון (לשליחה ב-WhatsApp)</div>
              <input
                type="tel"
                value={teacherPhone}
                onChange={(e) => setTeacherPhone(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:border-[#01696f]"
                placeholder="050-1234567"
              />
            </label>
            <label className="block">
              <div className="text-sm text-slate-700 mb-1">אימייל</div>
              <input
                type="email"
                value={teacherEmail}
                onChange={(e) => setTeacherEmail(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:border-[#01696f]"
                placeholder="teacher@school.edu"
              />
            </label>
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <button
              onClick={generateLink}
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : null}
              צור קישור עבור המורה
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="card">
            <div className="text-sm font-semibold text-[#01696f] mb-2">הקישור עבור המורה:</div>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={teacherUrl}
                readOnly
                className="flex-1 border border-slate-300 rounded-lg p-3 bg-slate-50 text-sm font-mono"
                dir="ltr"
              />
              <button onClick={copyUrl} className="btn-ghost flex-shrink-0">
                {copied ? <Check size={20} className="text-green-600" /> : <Copy size={20} />}
              </button>
            </div>
          </div>

          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="card flex items-center gap-3 hover:bg-green-50 transition cursor-pointer"
            >
              <div className="bg-green-500 text-white p-3 rounded-full">
                <MessageCircle size={24} />
              </div>
              <div>
                <div className="font-bold text-slate-800">שליחה ב-WhatsApp</div>
                <div className="text-sm text-slate-600">פתיחת WhatsApp עם הודעה מוכנה</div>
              </div>
            </a>
          )}

          {teacherEmail && (
            <a
              href={`mailto:${teacherEmail}?subject=${encodeURIComponent(`שאלון מורה - ${childName}`)}&body=${encodeURIComponent(shareMessage ?? '')}`}
              className="card flex items-center gap-3 hover:bg-blue-50 transition cursor-pointer"
            >
              <div className="bg-blue-500 text-white p-3 rounded-full">
                <Mail size={24} />
              </div>
              <div>
                <div className="font-bold text-slate-800">שליחה במייל</div>
                <div className="text-sm text-slate-600">{teacherEmail}</div>
              </div>
            </a>
          )}

          {shareMessage && (
            <div className="card">
              <div className="flex justify-between items-center mb-2">
                <div className="font-semibold text-[#01696f]">הודעה מוכנה להעתקה:</div>
                <button onClick={copyMessage} className="text-sm text-[#01696f] hover:underline flex items-center gap-1">
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  העתק
                </button>
              </div>
              <pre className="bg-slate-50 p-3 rounded text-sm text-slate-700 whitespace-pre-wrap font-sans border border-slate-200">
                {shareMessage}
              </pre>
            </div>
          )}

          <div className="card bg-[#f0f9fa] border-r-4 border-r-[#01696f]">
            <div className="font-semibold text-[#01696f] mb-1">מה הלאה?</div>
            <ol className="list-decimal mr-5 text-sm text-slate-700 space-y-1">
              <li>שלחו את הקישור למורה (WhatsApp / מייל / כל ערוץ אחר)</li>
              <li>המורה תמלא את השאלון (כ-10 דקות) – ישירות באתר</li>
              <li>תקבלו הודעה כשהשאלון יושלם, ונפתח עבורכם זימון לפגישת אבחון</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
