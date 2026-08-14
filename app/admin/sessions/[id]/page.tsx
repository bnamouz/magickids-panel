import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { ArrowRight, User, School, Phone, Mail, Calendar, ClipboardList, Brain } from 'lucide-react';
import ClinicalNotes from '@/components/admin/ClinicalNotes';
import ResponsesTable from '@/components/admin/ResponsesTable';
import ScoreCard from '@/components/admin/ScoreCard';
import BookAppointment from './BookAppointment';

export const dynamic = 'force-dynamic';

export default async function SessionDetailPage({ params }: { params: { id: string } }) {
  const staff = await requireStaff();
  const supabase = getSupabaseAdmin();

  const { data: session } = await supabase
    .from('intake_sessions')
    .select(`
      id, status, created_at, updated_at, reason_for_referral, channel,
      parent_token, teacher_token,
      patients(id, first_name, last_name, birth_date, school, grade, gender, teacher_name, teacher_phone),
      parents(full_name, phone, email, relation)
    `)
    .eq('id', params.id)
    .maybeSingle();

  if (!session) notFound();

  const patient = (session as any).patients;
  const parent = (session as any).parents?.[0];
  const childName = `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim() || '—';

  // Load questionnaires + scores + notes + appointments in parallel
  const [{ data: questionnaires }, { data: scores }, { data: notes }, { data: appointments }, { data: audit }] = await Promise.all([
    supabase.from('questionnaires').select('*').eq('session_id', session.id).order('type'),
    supabase.from('scores').select('*').eq('session_id', session.id).order('created_at', { ascending: false }),
    supabase.from('clinical_notes').select('*, staff_users(full_name)').eq('session_id', session.id).order('created_at', { ascending: false }),
    supabase.from('appointments').select('*').eq('session_id', session.id).order('scheduled_at'),
    supabase.from('audit_log').select('*').eq('session_id', session.id).order('created_at', { ascending: false }).limit(20),
  ]);

  const parentQ = questionnaires?.find((q: any) => q.type === 'vanderbilt_parent');
  const teacherQ = questionnaires?.find((q: any) => q.type === 'vanderbilt_teacher');
  const parentScore = scores?.find((s: any) => s.scope === 'parent');
  const teacherScore = scores?.find((s: any) => s.scope === 'teacher');
  const combinedScore = scores?.find((s: any) => s.scope === 'combined');

  return (
    <div>
      {/* Breadcrumb + header */}
      <div className="mb-6">
        <Link href="/admin/sessions" className="text-sm text-slate-500 hover:text-[#01696f] flex items-center gap-1 mb-3">
          <ArrowRight size={14} /> חזרה לרשימה
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">{childName}</h1>
            <p className="text-slate-500 mt-1">
              {patient?.birth_date && `${calcAge(patient.birth_date)} · נולד/ה ${new Date(patient.birth_date).toLocaleDateString('he-IL')}`}
              {patient?.school && ` · ${patient.school}`}
              {patient?.grade && ` · כיתה ${patient.grade}`}
            </p>
          </div>
          <StatusBadge status={session.status} />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Combined profile - top priority */}
          {combinedScore && <ScoreCard score={combinedScore} title="פרופיל קליני משולב" primary />}

          {/* Parent + Teacher scores side by side */}
          <div className="grid md:grid-cols-2 gap-4">
            {parentScore && <ScoreCard score={parentScore} title="ניקוד הורה" />}
            {teacherScore && <ScoreCard score={teacherScore} title="ניקוד מורה" />}
          </div>

          {/* Complaint */}
          {(session as any).reason_for_referral && (
            <div className="card">
              <h2 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                <ClipboardList size={18} className="text-[#01696f]" /> תלונה ראשית
              </h2>
              <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{(session as any).reason_for_referral}</p>
            </div>
          )}

          {/* Responses tabs */}
          {(parentQ || teacherQ) && (
            <div className="card">
              <h2 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Brain size={18} className="text-[#01696f]" /> תשובות שאלונים
              </h2>
              <ResponsesTable parentQ={parentQ} teacherQ={teacherQ} />
            </div>
          )}

          {/* Clinical notes */}
          <ClinicalNotes sessionId={session.id} notes={notes ?? []} currentStaffId={staff.id} />
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Contacts */}
          <div className="card">
            <h2 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <User size={18} className="text-[#01696f]" /> אנשי קשר
            </h2>
            <div className="space-y-3 text-sm">
              <ContactBlock title={`הורה (${parent?.relation ?? 'הורה'})`} name={parent?.full_name} phone={parent?.phone} email={parent?.email} />
              <div className="border-t border-slate-100 pt-3">
                <ContactBlock
                  title="מורה"
                  name={patient?.teacher_name}
                  phone={patient?.teacher_phone}
                  email={undefined}
                />
              </div>
            </div>
          </div>

          {/* Appointments */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Calendar size={18} className="text-[#01696f]" /> פגישות
              </h2>
              <BookAppointment sessionId={session.id} childName={childName} />
            </div>
            {!appointments?.length ? (
              <p className="text-sm text-slate-500">טרם נקבעה פגישה</p>
            ) : (
              <ul className="space-y-2">
                {appointments.map((a: any) => {
                  const typeLabel = a.appointment_type === 'assessment' ? 'אבחון ADHD'
                    : a.appointment_type === 'followup' ? 'מעקב'
                    : a.appointment_type === 'moxo' ? 'בדיקת Moxo'
                    : (a.appointment_type ?? 'פגישה');
                  const statusLabel: Record<string, string> = {
                    scheduled: 'מתוזמן',
                    confirmed: 'אושר',
                    attended: 'התקיים',
                    no_show: 'לא הופיע',
                    cancelled: 'בוטל',
                    rescheduled: 'תוזמן מחדש',
                  };
                  return (
                    <li key={a.id} className="text-sm border-r-2 border-r-[#01696f] pr-3">
                      <div className="font-semibold text-slate-800">{typeLabel}</div>
                      <div className="text-slate-500 text-xs">
                        {new Date(a.scheduled_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' })} · {statusLabel[a.status] ?? a.status}
                      </div>
                      {a.location && (
                        <div className="text-slate-400 text-xs">{a.location}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Audit log */}
          <div className="card">
            <h2 className="font-bold text-slate-800 mb-3">היסטוריה</h2>
            {!audit?.length ? (
              <p className="text-sm text-slate-500">אין רישומים</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {audit.slice(0, 8).map((a: any) => (
                  <li key={a.id} className="border-r-2 border-r-slate-200 pr-2">
                    <div className="text-slate-700">{a.action}</div>
                    <div className="text-slate-400">
                      {new Date(a.created_at).toLocaleString('he-IL')} · {a.actor}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    created: 'נוצר',
    parent_form_started: 'הורה ממלא',
    parent_form_done: 'הורה השלים',
    teacher_link_sent: 'ממתין למורה',
    teacher_form_started: 'מורה ממלאה',
    teacher_form_done: 'מורה השלימה',
    profile_ready: 'מוכן לזימון',
    scheduled: 'תור נקבע',
    completed: 'הושלם',
    cancelled: 'בוטל',
  };
  return (
    <span className="px-4 py-2 rounded-full bg-teal-50 text-[#01696f] font-semibold text-sm">
      {labels[status] ?? status}
    </span>
  );
}

function ContactBlock({ title, name, phone, email }: { title: string; name?: string; phone?: string; email?: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500 mb-1">{title}</div>
      <div className="font-semibold text-slate-800">{name ?? '—'}</div>
      {phone && (
        <a href={`tel:${phone}`} className="text-xs text-slate-600 flex items-center gap-1 mt-1" dir="ltr">
          <Phone size={12} /> {phone}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className="text-xs text-slate-600 flex items-center gap-1 mt-1" dir="ltr">
          <Mail size={12} /> {email}
        </a>
      )}
    </div>
  );
}

function calcAge(birth_date: string): string {
  const years = Math.floor((Date.now() - new Date(birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return `גיל ${years}`;
}
