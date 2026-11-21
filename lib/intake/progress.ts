import { VANDERBILT_PARENT_QUESTIONS } from '@/questions/vanderbilt_parent';
import { VANDERBILT_TEACHER_QUESTIONS } from '@/questions/vanderbilt_teacher';
import { adultResponsesComplete } from '@/lib/adult-scoring';
export type QuestionnaireType = 'vanderbilt_parent' | 'vanderbilt_teacher' | 'asrs_adult';
/** Adult track: the person assessed fills in one self-report; there is no parent or teacher questionnaire. */
export const ADULT_QUESTIONNAIRE = 'asrs_adult';
export type QuestionnaireProgress = { type: string; is_complete?: boolean | null; submitted_at?: string | null; responses?: Record<string, number> | null };
export type IntakeAppointment = { id?: string; status: string; scheduled_at?: string; appointment_type?: string };
export const CLOSED_INTAKE_STATUSES = ['closed', 'cancelled', 'reported', 'completed'];
export const INTAKE_STAGES = { parent: 'ממתין לשאלון הורים', teacher: 'ממתין לשאלון מורה', self: 'ממתין לשאלון הערכה עצמית', ready: 'מוכן לזימון', scheduled: 'פגישה נקבעה', closed: 'התהליך הסתיים' };
export type IntakeStage = keyof typeof INTAKE_STAGES;
export function completeResponses(type: QuestionnaireType, responses?: Record<string, number> | null) {
  if (type === ADULT_QUESTIONNAIRE) return adultResponsesComplete(responses);
  const questions = type === 'vanderbilt_parent' ? VANDERBILT_PARENT_QUESTIONS : VANDERBILT_TEACHER_QUESTIONS;
  return !!responses && questions.every(question => {
    const value = responses[String(question.id)];
    return Number.isInteger(value) && value >= (question.section === 'A' ? 0 : 1) && value <= (question.section === 'A' ? 3 : 5);
  });
}
export function questionnaireSubmitted(questionnaire?: QuestionnaireProgress) {
  return !!questionnaire && (questionnaire.type === 'vanderbilt_parent' || questionnaire.type === 'vanderbilt_teacher' || questionnaire.type === ADULT_QUESTIONNAIRE) && questionnaire.is_complete === true && !!questionnaire.submitted_at && Number.isFinite(Date.parse(questionnaire.submitted_at)) && completeResponses(questionnaire.type, questionnaire.responses);
}
/** `track` comes from intake_sessions.track; an adult self-report on the file marks the adult track as well. */
export function intakeProgress(questionnaires: QuestionnaireProgress[], appointments: IntakeAppointment[] = [], status = 'created', track?: string | null) {
  const self = questionnaires.find(q => q.type === ADULT_QUESTIONNAIRE), adult = track === 'adult' || !!self;
  const parent = adult ? self : questionnaires.find(q => q.type === 'vanderbilt_parent'), teacher = adult ? undefined : questionnaires.find(q => q.type === 'vanderbilt_teacher');
  const parentComplete = questionnaireSubmitted(parent), teacherComplete = questionnaireSubmitted(teacher);
  const bothComplete = adult ? parentComplete : parentComplete && teacherComplete;
  const hasAppointment = appointments.some(appointment => ['scheduled', 'confirmed', 'attended', 'completed'].includes(appointment.status));
  // A new assessment may be booked unless an active visit is still ahead; past visits
  // (attended, no-show, or never marked) do not block a repeat assessment.
  const upcomingAppointment = appointments.some(appointment => ['scheduled', 'confirmed'].includes(appointment.status) && (!appointment.scheduled_at || Date.parse(appointment.scheduled_at) > Date.now()));
  const stage: IntakeStage = CLOSED_INTAKE_STATUSES.includes(status) ? 'closed' : hasAppointment ? 'scheduled' : !parentComplete ? (adult ? 'self' : 'parent') : !bothComplete ? 'teacher' : 'ready';
  return { adult, parentComplete, teacherComplete, bothComplete, hasAppointment, upcomingAppointment, canBookAssessment: bothComplete && !upcomingAppointment, stage, readyToSchedule: stage === 'ready',
    parentSubmittedAt: parentComplete ? parent!.submitted_at! : null, teacherSubmittedAt: teacherComplete ? teacher!.submitted_at! : null,
    readyAt: !bothComplete ? null : adult ? parent!.submitted_at! : new Date(Math.max(Date.parse(parent!.submitted_at!), Date.parse(teacher!.submitted_at!))).toISOString() };
}
export function firstRelated<T>(value: T | T[] | null | undefined): T | undefined { return Array.isArray(value) ? value[0] : value ?? undefined; }
