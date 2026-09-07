import { VANDERBILT_PARENT_QUESTIONS } from '@/questions/vanderbilt_parent';
import { VANDERBILT_TEACHER_QUESTIONS } from '@/questions/vanderbilt_teacher';
export type QuestionnaireType = 'vanderbilt_parent' | 'vanderbilt_teacher';
export type QuestionnaireProgress = { type: string; is_complete?: boolean | null; submitted_at?: string | null; responses?: Record<string, number> | null };
export type IntakeAppointment = { id?: string; status: string; scheduled_at?: string; appointment_type?: string };
export const CLOSED_INTAKE_STATUSES = ['closed', 'cancelled', 'reported', 'completed'];
export const INTAKE_STAGES = { parent: 'ממתין לשאלון הורים', teacher: 'ממתין לשאלון מורה', ready: 'מוכן לזימון', scheduled: 'פגישה נקבעה', closed: 'התהליך הסתיים' };
export type IntakeStage = keyof typeof INTAKE_STAGES;
export function completeResponses(type: QuestionnaireType, responses?: Record<string, number> | null) {
  const questions = type === 'vanderbilt_parent' ? VANDERBILT_PARENT_QUESTIONS : VANDERBILT_TEACHER_QUESTIONS;
  return !!responses && questions.every(question => {
    const value = responses[String(question.id)];
    return Number.isInteger(value) && value >= (question.section === 'A' ? 0 : 1) && value <= (question.section === 'A' ? 3 : 5);
  });
}
export function questionnaireSubmitted(questionnaire?: QuestionnaireProgress) {
  return !!questionnaire && (questionnaire.type === 'vanderbilt_parent' || questionnaire.type === 'vanderbilt_teacher') && questionnaire.is_complete === true && !!questionnaire.submitted_at && Number.isFinite(Date.parse(questionnaire.submitted_at)) && completeResponses(questionnaire.type, questionnaire.responses);
}
export function intakeProgress(questionnaires: QuestionnaireProgress[], appointments: IntakeAppointment[] = [], status = 'created') {
  const parent = questionnaires.find(q => q.type === 'vanderbilt_parent'), teacher = questionnaires.find(q => q.type === 'vanderbilt_teacher');
  const parentComplete = questionnaireSubmitted(parent), teacherComplete = questionnaireSubmitted(teacher);
  const bothComplete = parentComplete && teacherComplete;
  const hasAppointment = appointments.some(appointment => ['scheduled', 'confirmed', 'attended', 'completed'].includes(appointment.status));
  const stage: IntakeStage = CLOSED_INTAKE_STATUSES.includes(status) ? 'closed' : hasAppointment ? 'scheduled' : !parentComplete ? 'parent' : !teacherComplete ? 'teacher' : 'ready';
  return { parentComplete, teacherComplete, bothComplete, hasAppointment, stage, readyToSchedule: stage === 'ready',
    parentSubmittedAt: parentComplete ? parent!.submitted_at! : null, teacherSubmittedAt: teacherComplete ? teacher!.submitted_at! : null,
    readyAt: bothComplete ? new Date(Math.max(Date.parse(parent!.submitted_at!), Date.parse(teacher!.submitted_at!))).toISOString() : null };
}
export function firstRelated<T>(value: T | T[] | null | undefined): T | undefined { return Array.isArray(value) ? value[0] : value ?? undefined; }
