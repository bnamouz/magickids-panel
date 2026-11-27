/** Client-safe constants for the Maccabi commitment desk (no server-only imports). */
export const MACCABI_BRANCH_EMAIL = 'shfaram@mac.org.il';
/** Maccabi national imaging center + imaging consult mailbox (owner request, 25.11.2026). One mail, both addresses. */
export const MACCABI_IMAGING_EMAILS = ['DimutRequest@mac.org.il', 'ImageConsult@mac.org.il'] as const;
/** Maccabi drug approvals department (verified on maccabi4u.co.il/eligibilites/3865/). */
export const MACCABI_DRUG_APPROVAL_EMAIL = 'Drugs-approve@mac.org.il';
/** Physician appeal mailbox: NOT yet provided by the owner. While empty, appeals are refused (appeal_address_missing) unless sent as a test to self. Never guess. */
export const MACCABI_DRUG_APPEAL_EMAIL: string = '';
export type RequestKind = 'commitment' | 'imaging' | 'drug_approval' | 'drug_appeal';
export const REQUEST_KINDS: readonly RequestKind[] = ['commitment', 'imaging', 'drug_approval', 'drug_appeal'];
export const isDrugKind = (kind: RequestKind | string | null | undefined): kind is 'drug_approval' | 'drug_appeal' => kind === 'drug_approval' || kind === 'drug_appeal';
export const REMINDER_AFTER_BUSINESS_DAYS = 3;
/** Maccabi states up to 5 working days for the imaging center, so the first automatic reminder goes out on the 6th. */
export const IMAGING_REMINDER_AFTER_BUSINESS_DAYS = 6;
/** Maccabi states an answer within 5 working days for drug approvals, so the first reminder goes out on the 6th (as for imaging). */
export const DRUG_REMINDER_AFTER_BUSINESS_DAYS = 6;
export const reminderAfter = (kind: RequestKind | null | undefined) => (kind === 'imaging' ? IMAGING_REMINDER_AFTER_BUSINESS_DAYS : isDrugKind(kind) ? DRUG_REMINDER_AFTER_BUSINESS_DAYS : REMINDER_AFTER_BUSINESS_DAYS);
export const SERVICES = ['ביקור רופא ילדים', 'בדיקת רופא מומחה', 'אבחון קשב וריכוז (ADHD)', 'מבדק MOXO', 'הערכת התפתחות הילד', 'ריפוי בעיסוק', 'קלינאות תקשורת', 'טיפול רגשי', 'אחר'] as const;
export const IMAGING_TYPES = ['MRI', 'CT', 'PET-CT', 'מיפוי', 'אולטרסאונד', 'צילום רנטגן', 'אחר'] as const;
export type CommitmentStatus = 'sent' | 'reminded' | 'reply_received' | 'ready' | 'rejected' | 'cancelled';
export const STATUS_LABEL: Record<CommitmentStatus, string> = { sent: 'נשלח למכבי', reminded: 'נשלחה תזכורת', reply_received: 'התקבלה תשובה – לבדיקה', ready: 'ההתחייבות מוכנה', rejected: 'נדחה / חסר', cancelled: 'בוטל' };
export const IMAGING_STATUS_LABEL: Record<CommitmentStatus, string> = { ...STATUS_LABEL, sent: 'נשלח למרכז הדימות', ready: 'הבדיקה אושרה' };
export const DRUG_APPROVAL_STATUS_LABEL: Record<CommitmentStatus, string> = { ...STATUS_LABEL, sent: 'נשלח למחלקת אישורי תרופות', ready: 'התרופה אושרה', rejected: 'נדחה / חסר' };
export const DRUG_APPEAL_STATUS_LABEL: Record<CommitmentStatus, string> = { ...STATUS_LABEL, sent: 'הערעור נשלח', ready: 'הערעור התקבל', rejected: 'הערעור נדחה' };
export const statusLabel = (kind: RequestKind | null | undefined, status: CommitmentStatus) =>
  (kind === 'imaging' ? IMAGING_STATUS_LABEL : kind === 'drug_approval' ? DRUG_APPROVAL_STATUS_LABEL : kind === 'drug_appeal' ? DRUG_APPEAL_STATUS_LABEL : STATUS_LABEL)[status];
/** Where a request of this kind is e-mailed (comma-separated when there is more than one mailbox). */
export const recipientFor = (kind: RequestKind | null | undefined) =>
  kind === 'imaging' ? MACCABI_IMAGING_EMAILS.join(', ') : kind === 'drug_approval' ? MACCABI_DRUG_APPROVAL_EMAIL : kind === 'drug_appeal' ? MACCABI_DRUG_APPEAL_EMAIL : MACCABI_BRANCH_EMAIL;
/** Imaging request text shown to Maccabi: the test type plus the examined area / details. */
export const imagingService = (type: string, detail: string) => (type === 'אחר' ? detail.trim() : `${type} – ${detail.trim()}`);
/** Drug request text shown to Maccabi: "<drug name> – <dosage>" (max 200 chars, like imagingService). */
export const drugService = (name: string, dosage: string) => [name.trim(), dosage.trim()].filter(Boolean).join(' – ').slice(0, 200);
export const OPEN_STATUSES: CommitmentStatus[] = ['sent', 'reminded', 'reply_received'];

/** Clinic phone shown to families and in e-mail signatures (re-exported by lib/maccabi/commitments.ts). */
export const CLINIC_PHONE = '054-349-6656';
type DrugKind = 'drug_approval' | 'drug_appeal';
type FamilyLang = 'he' | 'ar';
type NoticeInput = { patientName: string; drug: string };
const HELLO: Record<FamilyLang, string> = { he: 'שלום, כאן מרפאת הילדים של ד״ר בסים נמוז.', ar: 'مرحبًا، معكم عيادة الأطفال – د. بسيم نموز.' };
const ASK: Record<FamilyLang, string> = { he: `לשאלות: ${CLINIC_PHONE}`, ar: `للاستفسار: ${CLINIC_PHONE}` };
/** Family WhatsApp texts for drug requests, kept together so the owner can approve/edit them in one place.
 *  SENT = optional notice right after the request/appeal was e-mailed (notify_family); READY = after Maccabi approved. */
export const DRUG_FAMILY_TEXTS: Record<'sent' | 'ready', Record<DrugKind, Record<FamilyLang, (i: NoticeInput) => string>>> = {
  sent: {
    drug_approval: {
      he: (i) => `הבקשה לאישור התרופה עבור ${i.patientName} (${i.drug}) נשלחה היום למחלקת אישורי התרופות של מכבי.\nלפי מכבי, תשובה ניתנת בתוך 5 ימי עבודה, במסרון לטלפון המעודכן במכבי.`,
      ar: (i) => `تم اليوم إرسال طلب الموافقة على الدواء لـ${i.patientName} (${i.drug}) إلى قسم الموافقة على الأدوية في مكابي.\nحسب مكابي، يصل الرد خلال 5 أيام عمل برسالة نصية إلى رقم الهاتف المسجّل في مكابي.`,
    },
    drug_appeal: {
      he: (i) => `הערעור על ההחלטה בבקשה לאישור התרופה עבור ${i.patientName} (${i.drug}) נשלח היום למכבי.\nהערעור נמצא במעקב מרפאת הילדים.`,
      ar: (i) => `تم اليوم إرسال الاستئناف على القرار بخصوص طلب الموافقة على الدواء لـ${i.patientName} (${i.drug}) إلى مكابي.\nتتابع عيادة الأطفال الاستئناف.`,
    },
  },
  ready: {
    drug_approval: {
      he: (i) => `התקבל ממכבי אישור לתרופה עבור ${i.patientName} (${i.drug}).\nאפשר לפנות לבית המרקחת עם המרשם.`,
      ar: (i) => `وصلت موافقة مكابي على الدواء لـ${i.patientName} (${i.drug}).\nيمكنكم التوجه إلى الصيدلية مع الوصفة الطبية.`,
    },
    drug_appeal: {
      he: (i) => `הערעור התקבל, והתרופה עבור ${i.patientName} (${i.drug}) אושרה על ידי מכבי.\nאפשר לפנות לבית המרקחת עם המרשם.`,
      ar: (i) => `تم قبول الاستئناف، ووافقت مكابي على الدواء لـ${i.patientName} (${i.drug}).\nيمكنكم التوجه إلى الصيدلية مع الوصفة الطبية.`,
    },
  },
};
const drugText = (when: 'sent' | 'ready', kind: DrugKind, lang: FamilyLang | null | undefined, i: NoticeInput) => {
  const l: FamilyLang = lang === 'ar' ? 'ar' : 'he';
  return [HELLO[l], DRUG_FAMILY_TEXTS[when][kind][l](i), ASK[l]].join('\n');
};
/** Exact WhatsApp sent under notify_family (client-safe, used for the in-form preview too). */
export const drugFamilyNotice = (kind: DrugKind, lang: FamilyLang | null | undefined, i: NoticeInput) => drugText('sent', kind, lang, i);
/** Exact WhatsApp sent when a drug request/appeal is marked ready. */
export const drugReadyNotice = (kind: DrugKind, lang: FamilyLang | null | undefined, i: NoticeInput) => drugText('ready', kind, lang, i);
