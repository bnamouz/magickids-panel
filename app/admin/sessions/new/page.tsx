'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Loader2, CheckCircle, Copy, AlertCircle, User, Baby } from 'lucide-react';

export default function NewSessionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ session_id: string; parent_url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Child
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [grade, setGrade] = useState('');
  const [school, setSchool] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [teacherPhone, setTeacherPhone] = useState('');

  // Parent
  const [parentName, setParentName] = useState('');
  const [parentRelation, setParentRelation] = useState('mother');
  const [parentPhone, setParentPhone] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentChannel, setParentChannel] = useState('whatsapp');
  const [reason, setReason] = useState('');
  const [consent, setConsent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          birth_date: birthDate,
          gender: gender || null,
          grade: grade || null,
          school: school || null,
          teacher_name: teacherName || null,
          teacher_phone: teacherPhone || null,
          parent_full_name: parentName,
          parent_relation: parentRelation,
          parent_phone: parentPhone,
          parent_email: parentEmail || null,
          parent_channel: parentChannel,
          reason_for_referral: reason || null,
          consent_given: consent,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || 'שגיאה לא ידועה');
        setLoading(false);
        return;
      }

      setSuccess({ session_id: data.session_id, parent_url: data.parent_url });
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    if (!success) return;
    const fullUrl = window.location.origin + success.parent_url;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (success) {
    const fullUrl = typeof window !== 'undefined' ? window.location.origin + success.parent_url : success.parent_url;
    return (
      <div dir="rtl" className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="text-emerald-600" size={36} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">התיק נוצר בהצלחה</h1>
          <p className="text-slate-600 mb-6">שלחו את הקישור הזה להורה למילוי השאלון:</p>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
            <div className="text-xs text-slate-500 mb-2">קישור למילוי שאלון הורה</div>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                readOnly
                value={fullUrl}
                dir="ltr"
                className="flex-1 bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-700 font-mono"
              />
              <button
                onClick={copyLink}
                className="bg-[#01696f] text-white px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-1 hover:bg-[#0C4E54]"
              >
                {copied ? <><CheckCircle size={16} /> הועתק</> : <><Copy size={16} /> העתק</>}
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-500 mb-6">
            הקישור בתוקף ל-30 יום. הקוד עוד לא שולח את הקישור אוטומטית בוואטסאפ — זה יתווסף בשלב הבא.
          </div>

          <div className="flex gap-3 justify-center">
            <Link
              href="/admin/sessions"
              className="btn-primary flex items-center gap-2"
            >
              <ArrowRight size={16} /> חזור לתיקים פעילים
            </Link>
            <Link
              href={`/admin/sessions/${success.session_id}`}
              className="btn-secondary"
            >
              פרטי תיק
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-3xl mx-auto p-6">
      <div className="mb-6">
        <Link href="/admin/sessions" className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-2">
          <ArrowRight size={14} /> חזרה לתיקים
        </Link>
        <h1 className="text-3xl font-bold text-slate-900">פתיחת תיק חדש</h1>
        <p className="text-slate-500 text-sm mt-1">מלאו פרטי הילד וההורה. השאלון להורה יישלח בקישור נפרד.</p>
      </div>

      {error && (
        <div className="bg-red-50 border-r-4 border-r-red-500 rounded-lg p-4 mb-6 flex gap-2 items-start">
          <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Child Section */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Baby className="text-[#01696f]" size={20} />
            <h2 className="text-lg font-bold text-slate-900">פרטי הילד</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="שם פרטי *" value={firstName} onChange={setFirstName} required />
            <Field label="שם משפחה *" value={lastName} onChange={setLastName} required />
            <Field label="תאריך לידה *" type="date" value={birthDate} onChange={setBirthDate} required />
            <Select
              label="מגדר"
              value={gender}
              onChange={setGender}
              options={[
                { value: '', label: 'לא צוין' },
                { value: 'male', label: 'זכר' },
                { value: 'female', label: 'נקבה' },
                { value: 'other', label: 'אחר' },
              ]}
            />
            <Field label="כיתה / גן" value={grade} onChange={setGrade} placeholder="ב', גן חובה, וכו'" />
            <Field label="בית ספר" value={school} onChange={setSchool} />
            <Field label="שם המורה" value={teacherName} onChange={setTeacherName} />
            <Field label="טלפון המורה" value={teacherPhone} onChange={setTeacherPhone} placeholder="050-1234567" />
          </div>
        </div>

        {/* Parent Section */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <User className="text-[#01696f]" size={20} />
            <h2 className="text-lg font-bold text-slate-900">פרטי ההורה</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="שם מלא *" value={parentName} onChange={setParentName} required />
            <Select
              label="קשר *"
              value={parentRelation}
              onChange={setParentRelation}
              options={[
                { value: 'mother', label: 'אמא' },
                { value: 'father', label: 'אבא' },
                { value: 'guardian', label: 'אפוטרופוס' },
                { value: 'other', label: 'אחר' },
              ]}
              required
            />
            <Field label="טלפון *" value={parentPhone} onChange={setParentPhone} placeholder="050-1234567" required />
            <Field label="אימייל" type="email" value={parentEmail} onChange={setParentEmail} />
            <Select
              label="ערוץ תקשורת מועדף"
              value={parentChannel}
              onChange={setParentChannel}
              options={[
                { value: 'whatsapp', label: 'WhatsApp' },
                { value: 'sms', label: 'SMS' },
                { value: 'email', label: 'אימייל' },
                { value: 'phone', label: 'שיחה' },
              ]}
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              סיבת הפנייה
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:border-[#01696f] focus:ring-2 focus:ring-teal-100 resize-none"
              placeholder="קשיים בקשב, אימפולסיביות, קשיים בהתארגנות..."
            />
          </div>
        </div>

        {/* Consent */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <label className="flex gap-3 items-start cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 w-5 h-5"
              required
            />
            <div className="text-sm text-slate-700">
              <div className="font-semibold mb-1">הסכמת ההורה *</div>
              ההורה נתן הסכמה מפורשת לשמירת נתוני הילד למטרות אבחון, ולשליחת שאלונים באמצעות ערוץ התקשורת שנבחר.
            </div>
          </label>
        </div>

        {/* Submit */}
        <div className="flex gap-3 justify-end">
          <Link href="/admin/sessions" className="btn-secondary">ביטול</Link>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex items-center gap-2 min-w-[150px] justify-center"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : null}
            {loading ? 'יוצר תיק...' : 'צור תיק'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <div className="text-sm font-semibold text-slate-700 mb-1">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-[#01696f] focus:ring-2 focus:ring-teal-100"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <label className="block">
      <div className="text-sm font-semibold text-slate-700 mb-1">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-[#01696f] focus:ring-2 focus:ring-teal-100 bg-white"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </label>
  );
}
