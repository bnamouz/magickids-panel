/**
 * PDF Report Generator using @react-pdf/renderer
 * Hebrew RTL support via Assistant font
 */

import React from 'react';
import path from 'path';
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from '@react-pdf/renderer';
import type { GeneratedReport } from './report-generator';
import type { VanderbiltScore } from './vanderbilt-scoring';

// Register Hebrew font (Assistant from Google Fonts, bundled in public/fonts)
const fontDir = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: 'Assistant',
  fonts: [
    { src: path.join(fontDir, 'Assistant-Regular.ttf'), fontWeight: 400 },
    { src: path.join(fontDir, 'Assistant-SemiBold.ttf'), fontWeight: 600 },
    { src: path.join(fontDir, 'Assistant-Bold.ttf'), fontWeight: 700 },
  ],
});

// Disable hyphenation for Hebrew
Font.registerHyphenationCallback((word) => [word]);

const COLORS = {
  primary: '#01696F',
  primaryDark: '#0C4E54',
  text: '#28251D',
  muted: '#7A7974',
  faint: '#BAB9B4',
  border: '#D4D1CA',
  bgLight: '#F9F8F5',
  bgAlt: '#FBFBF9',
  success: '#437A22',
  warning: '#964219',
  error: '#A12C7B',
};

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Assistant',
    fontSize: 11,
    paddingTop: 50,
    paddingBottom: 60,
    paddingHorizontal: 45,
    color: COLORS.text,
    lineHeight: 1.6,
    direction: 'rtl',
  },
  // Cover page
  coverPage: {
    fontFamily: 'Assistant',
    padding: 60,
    backgroundColor: '#FBFBF9',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '100%',
  },
  coverHeader: {
    borderBottom: `3px solid ${COLORS.primary}`,
    paddingBottom: 24,
    marginBottom: 40,
  },
  logoText: {
    fontSize: 32,
    fontWeight: 700,
    color: COLORS.primary,
    letterSpacing: 1,
    textAlign: 'right',
  },
  logoSubtext: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 4,
    textAlign: 'right',
  },
  coverTitle: {
    fontSize: 26,
    fontWeight: 700,
    color: COLORS.text,
    textAlign: 'right',
    marginBottom: 10,
  },
  coverSubtitle: {
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'right',
    marginBottom: 40,
  },
  coverInfoBox: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 4,
    border: `1px solid ${COLORS.border}`,
  },
  coverInfoRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottom: `1px dotted ${COLORS.border}`,
  },
  coverInfoLabel: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: 600,
    textAlign: 'right',
  },
  coverInfoValue: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: 400,
    textAlign: 'left',
  },
  coverFooter: {
    borderTop: `2px solid ${COLORS.primary}`,
    paddingTop: 16,
    textAlign: 'right',
  },
  coverClinicianName: {
    fontSize: 15,
    fontWeight: 700,
    color: COLORS.primary,
    textAlign: 'right',
  },
  coverClinicianTitle: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 3,
    textAlign: 'right',
  },
  // Content pages
  pageHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: `2px solid ${COLORS.primary}`,
    paddingBottom: 8,
    marginBottom: 20,
  },
  pageHeaderTitle: {
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: 600,
    textAlign: 'right',
  },
  pageHeaderRight: {
    fontSize: 10,
    color: COLORS.primary,
    fontWeight: 700,
    textAlign: 'left',
  },
  h2: {
    fontSize: 16,
    fontWeight: 700,
    color: COLORS.primary,
    marginBottom: 8,
    marginTop: 6,
    textAlign: 'right',
    direction: 'rtl',
  },
  h3: {
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.text,
    marginBottom: 6,
    marginTop: 10,
    textAlign: 'right',
    direction: 'rtl',
  },
  paragraph: {
    fontSize: 11,
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'right',
    lineHeight: 1.7,
    direction: 'rtl',
  },
  bulletRow: {
    flexDirection: 'row-reverse',
    marginBottom: 4,
    paddingRight: 8,
  },
  bulletDot: {
    fontSize: 11,
    color: COLORS.primary,
    marginLeft: 8,
    marginRight: 0,
    width: 12,
  },
  bulletText: {
    fontSize: 11,
    color: COLORS.text,
    flex: 1,
    textAlign: 'right',
    lineHeight: 1.6,
  },
  // Info grid
  infoGrid: {
    marginTop: 8,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row-reverse',
    paddingVertical: 5,
    borderBottom: `1px dotted ${COLORS.border}`,
  },
  infoLabel: {
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: 600,
    width: '35%',
    textAlign: 'right',
  },
  infoValue: {
    fontSize: 11,
    color: COLORS.text,
    flex: 1,
    textAlign: 'right',
    paddingRight: 8,
  },
  // Score table
  scoreTable: {
    marginTop: 10,
    marginBottom: 12,
    border: `1px solid ${COLORS.border}`,
  },
  scoreHeaderRow: {
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.primary,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  scoreHeaderCell: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: 700,
    textAlign: 'right',
  },
  scoreRow: {
    flexDirection: 'row-reverse',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottom: `1px solid ${COLORS.border}`,
  },
  scoreRowAlt: {
    flexDirection: 'row-reverse',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottom: `1px solid ${COLORS.border}`,
    backgroundColor: COLORS.bgAlt,
  },
  scoreCell: {
    fontSize: 10,
    color: COLORS.text,
    textAlign: 'right',
    direction: 'rtl',
  },
  colScale: { width: '45%', paddingRight: 4 },
  colScore: { width: '15%', textAlign: 'center' as any },
  colThreshold: { width: '10%', textAlign: 'center' as any },
  colStatus: { width: '30%', textAlign: 'right' as any, paddingRight: 8 },
  statusPass: { color: COLORS.warning, fontWeight: 700 },
  statusFail: { color: COLORS.success, fontWeight: 600 },
  // Diagnosis box
  diagBox: {
    backgroundColor: COLORS.bgLight,
    borderLeft: `4px solid ${COLORS.primary}`,
    padding: 12,
    marginVertical: 10,
  },
  diagText: {
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.primary,
    textAlign: 'right',
    lineHeight: 1.5,
  },
  // Disclaimer box
  disclaimerBox: {
    marginTop: 20,
    backgroundColor: '#FFF9F0',
    borderRight: `3px solid ${COLORS.warning}`,
    padding: 10,
  },
  disclaimerTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: COLORS.warning,
    marginBottom: 4,
    textAlign: 'right',
  },
  disclaimerText: {
    fontSize: 9,
    color: COLORS.text,
    textAlign: 'right',
    marginBottom: 3,
    lineHeight: 1.5,
  },
  // Signature
  signatureBlock: {
    marginTop: 24,
    paddingTop: 16,
    borderTop: `2px solid ${COLORS.primary}`,
    alignItems: 'flex-end',
  },
  signatureLine: {
    width: 220,
    borderBottom: `1px solid ${COLORS.text}`,
    marginBottom: 4,
  },
  signatureName: {
    fontSize: 13,
    fontWeight: 700,
    color: COLORS.primary,
    textAlign: 'right',
  },
  signatureTitle: {
    fontSize: 10,
    color: COLORS.muted,
    textAlign: 'right',
    marginTop: 2,
  },
  // Footer
  pageFooter: {
    position: 'absolute',
    bottom: 30,
    left: 45,
    right: 45,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    borderTop: `1px solid ${COLORS.border}`,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8,
    color: COLORS.muted,
  },
  // DSM-5 criteria / symptom tables
  colCrit: { width: '8%', textAlign: 'center' as any },
  colCritTitle: { width: '24%', paddingRight: 4 },
  colCritFinding: { width: '50%', paddingRight: 4 },
  colCritStatus: { width: '18%', textAlign: 'center' as any },
  colSymCode: { width: '9%', textAlign: 'center' as any },
  colSymText: { width: '55%', paddingRight: 4 },
  colSymSrc: { width: '12%', textAlign: 'center' as any },
  statusPartial: { color: '#8A6D00', fontWeight: 600 },
  statusUnknown: { color: COLORS.muted, fontWeight: 600 },
  kindBadge: {
    alignSelf: 'flex-end',
    marginTop: 10,
    marginBottom: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: '#FFF4E0',
    color: '#8A4B00',
    fontSize: 10,
    fontWeight: 600,
  },
  summaryBox: {
    marginTop: 8,
    marginBottom: 12,
    padding: 12,
    backgroundColor: COLORS.bgLight,
    borderRight: `3px solid ${COLORS.primary}`,
  },
  multi: {
    fontSize: 11,
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'right',
    lineHeight: 1.7,
    direction: 'rtl',
  },
});

export type PdfSymptomRow = { code: string; text: string; parent: number | null; teacher: number | null; present: 'present' | 'absent' | 'unclear' };

export interface PdfInput {
  patient: {
    firstName: string;
    lastName: string;
    birthDate: string | null;
    gender: string | null;
    grade: string | null;
    school: string | null;
    teacherName: string | null;
  };
  parent: {
    fullName: string;
    relation: string | null;
    phone: string;
  } | null;
  reasonForReferral: string | null;
  parentScore: VanderbiltScore | null;
  teacherScore: VanderbiltScore | null;
  clinicalNotes: Array<{ category: string; content: string }>;
  report: GeneratedReport;
  dsm5Items?: { inattention: PdfSymptomRow[]; hyperactivity: PdfSymptomRow[]; threshold: number; inattentionCount: number; hyperactivityCount: number };
  clinicianName: string;
  clinicianTitle: string;
  reportDate: string;
}

function formatDateHe(iso: string | null): string {
  if (!iso) return 'לא צוין';
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function ageFromBirth(bd: string | null): string {
  if (!bd) return 'לא צוין';
  const b = new Date(bd);
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) years--;
  return `${years} שנים`;
}

const genderHe: Record<string, string> = { male: 'זכר', female: 'נקבה', other: 'אחר' };

function PageHeader({ pageName, childName }: { pageName: string; childName: string }) {
  return (
    <View style={styles.pageHeader} fixed>
      <Text style={styles.pageHeaderTitle}>{pageName}</Text>
      <Text style={styles.pageHeaderRight}>{childName} · Magic Kids</Text>
    </View>
  );
}

function PageFooter({ reportDate }: { reportDate: string }) {
  return (
    <View style={styles.pageFooter} fixed>
      <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `עמוד ${pageNumber} מתוך ${totalPages}`} />
      <Text style={styles.footerText}>דוח אבחון ADHD · Magic Kids · {reportDate}</Text>
    </View>
  );
}

function CoverPage({ input }: { input: PdfInput }) {
  const childName = `${input.patient.firstName} ${input.patient.lastName}`;

  return (
    <Page size="A4" style={styles.coverPage}>
      <View style={styles.coverHeader}>
        <Text style={styles.logoText}>MAGIC KIDS</Text>
        <Text style={styles.logoSubtext}>מכון ילדי הקסם · אבחון וטיפול ADHD</Text>
      </View>

      <View>
        <Text style={styles.coverTitle}>דוח אבחון הפרעת קשב וריכוז (ADHD)</Text>
        <Text style={styles.coverSubtitle}>הערכה קלינית לפי קריטריוני DSM-5 ושאלוני NICHQ Vanderbilt</Text>
        {input.report.reportKind === 'preliminary' && <Text style={styles.kindBadge}>סיכום ראשוני מבוסס שאלונים – טרם הושלמה הערכה קלינית</Text>}

        <View style={styles.coverInfoBox}>
          <View style={styles.coverInfoRow}>
            <Text style={styles.coverInfoLabel}>שם הילד/ה</Text>
            <Text style={styles.coverInfoValue}>{childName}</Text>
          </View>
          <View style={styles.coverInfoRow}>
            <Text style={styles.coverInfoLabel}>תאריך לידה</Text>
            <Text style={styles.coverInfoValue}>{formatDateHe(input.patient.birthDate)} ({ageFromBirth(input.patient.birthDate)})</Text>
          </View>
          <View style={styles.coverInfoRow}>
            <Text style={styles.coverInfoLabel}>מין</Text>
            <Text style={styles.coverInfoValue}>{genderHe[input.patient.gender || ''] || 'לא צוין'}</Text>
          </View>
          <View style={styles.coverInfoRow}>
            <Text style={styles.coverInfoLabel}>כיתה</Text>
            <Text style={styles.coverInfoValue}>{input.patient.grade || 'לא צוין'}</Text>
          </View>
          <View style={styles.coverInfoRow}>
            <Text style={styles.coverInfoLabel}>בית ספר</Text>
            <Text style={styles.coverInfoValue}>{input.patient.school || 'לא צוין'}</Text>
          </View>
          <View style={styles.coverInfoRow}>
            <Text style={styles.coverInfoLabel}>תאריך הפקת הדוח</Text>
            <Text style={styles.coverInfoValue}>{input.reportDate}</Text>
          </View>
        </View>
      </View>

      <View style={styles.coverFooter}>
        <Text style={styles.coverClinicianName}>{input.clinicianName}</Text>
        <Text style={styles.coverClinicianTitle}>{input.clinicianTitle}</Text>
      </View>
    </Page>
  );
}

/** Renders a multi-paragraph string (paragraphs separated by blank lines). */
function Paragraphs({ text }: { text: string | undefined }) {
  if (!text || !text.trim()) return null;
  return <>{text.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean).map((p, i) => <Text key={i} style={styles.multi}>{p}</Text>)}</>;
}

const CATEGORY_HE: Record<string, string> = { general: 'כללי', clinical: 'קליני', follow_up: 'מעקב', flag: 'דגל אדום' };

function BackgroundPage({ input }: { input: PdfInput }) {
  const childName = `${input.patient.firstName} ${input.patient.lastName}`;
  const { report } = input;
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageName="רקע, מקורות מידע והיסטוריה" childName={childName} />

      <Text style={styles.h2}>פרטי משפחה</Text>
      <View style={styles.infoGrid}>
        {input.parent && (
          <>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>שם הורה</Text><Text style={styles.infoValue}>{input.parent.fullName}</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>קרבה</Text><Text style={styles.infoValue}>{input.parent.relation || 'לא צוין'}</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>טלפון</Text><Text style={styles.infoValue}>{input.parent.phone}</Text></View>
          </>
        )}
        {input.patient.teacherName && (
          <View style={styles.infoRow}><Text style={styles.infoLabel}>מחנך/ת</Text><Text style={styles.infoValue}>{input.patient.teacherName}</Text></View>
        )}
      </View>

      <Text style={styles.h2}>רקע וסיבת ההפניה</Text>
      {report.background ? <Paragraphs text={report.background} /> : <Text style={styles.paragraph}>{input.reasonForReferral || 'לא צוינה סיבת הפניה.'}</Text>}

      {report.sources ? (<><Text style={styles.h2}>מקורות המידע ושיטת האבחון</Text><Paragraphs text={report.sources} /></>) : null}
      {report.history ? (<><Text style={styles.h2}>היסטוריה התפתחותית, רפואית ומשפחתית</Text><Paragraphs text={report.history} /></>) : null}

      <PageFooter reportDate={input.reportDate} />
    </Page>
  );
}

function ScorePage({ input, score, respondentLabel }: { input: PdfInput; score: VanderbiltScore; respondentLabel: string }) {
  const childName = `${input.patient.firstName} ${input.patient.lastName}`;
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageName={`שאלון ${respondentLabel} – NICHQ Vanderbilt`} childName={childName} />
      <Text style={styles.h2}>ניתוח שאלון {respondentLabel}</Text>
      <Text style={styles.paragraph}>
        השאלון מולא ב-{score.completeness}% מהפריטים. ההצגה הקלינית העולה מהשאלון:{' '}
        <Text style={{ fontWeight: 700, color: COLORS.primary }}>{score.presentationLabelHe}</Text>.
      </Text>
      <Text style={styles.h3}>סיכום תת-סקאלות</Text>
      <View style={styles.scoreTable}>
        <View style={styles.scoreHeaderRow}>
          <Text style={[styles.scoreHeaderCell, styles.colScale]}>תת-סקאלה</Text>
          <Text style={[styles.scoreHeaderCell, styles.colScore]}>תסמינים</Text>
          <Text style={[styles.scoreHeaderCell, styles.colThreshold]}>סף</Text>
          <Text style={[styles.scoreHeaderCell, styles.colStatus]}>סטטוס</Text>
        </View>
        {score.subscales.map((s, i) => (
          <View key={s.key} style={i % 2 === 0 ? styles.scoreRow : styles.scoreRowAlt}>
            <Text style={[styles.scoreCell, styles.colScale]}>{s.labelHe}</Text>
            <Text style={[styles.scoreCell, styles.colScore]}>{s.symptomCount}</Text>
            <Text style={[styles.scoreCell, styles.colThreshold]}>{s.threshold}</Text>
            <View style={styles.colStatus}>
              <Text style={[styles.scoreCell, s.meetsThreshold ? styles.statusPass : styles.statusFail]}>{s.meetsThreshold ? 'מעל הסף' : 'מתחת לסף'}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={styles.h3}>תפקוד בבית ובבית הספר</Text>
      <Text style={styles.paragraph}>{score.performance.interpretation}</Text>
      <Text style={styles.h3}>פרשנות השאלון</Text>
      <Text style={styles.paragraph}>{score.clinicalSummary}</Text>
      <PageFooter reportDate={input.reportDate} />
    </Page>
  );
}

const STATUS_HE = { met: 'מתקיים', not_met: 'לא מתקיים', partial: 'חלקי', unknown: 'לא נבדק' } as const;
const statusStyle = (st: keyof typeof STATUS_HE) => st === 'met' ? styles.statusPass : st === 'not_met' ? styles.statusFail : st === 'partial' ? styles.statusPartial : styles.statusUnknown;

function SymptomTable({ title, rows, count, threshold }: { title: string; rows: PdfSymptomRow[]; count: number; threshold: number }) {
  return (
    <View>
      <Text style={styles.h3}>{title} – {count}/9 תסמינים (סף {threshold})</Text>
      <View style={styles.scoreTable}>
        <View style={styles.scoreHeaderRow}>
          <Text style={[styles.scoreHeaderCell, styles.colSymCode]}>קוד</Text>
          <Text style={[styles.scoreHeaderCell, styles.colSymText]}>תסמין</Text>
          <Text style={[styles.scoreHeaderCell, styles.colSymSrc]}>הורה</Text>
          <Text style={[styles.scoreHeaderCell, styles.colSymSrc]}>מורה</Text>
          <Text style={[styles.scoreHeaderCell, styles.colSymSrc]}>קביעה</Text>
        </View>
        {rows.map((r, i) => (
          <View key={r.code} style={i % 2 === 0 ? styles.scoreRow : styles.scoreRowAlt} wrap={false}>
            <Text style={[styles.scoreCell, styles.colSymCode]}>{r.code}</Text>
            <Text style={[styles.scoreCell, styles.colSymText]}>{r.text}</Text>
            <Text style={[styles.scoreCell, styles.colSymSrc]}>{r.parent === null ? '—' : r.parent}</Text>
            <Text style={[styles.scoreCell, styles.colSymSrc]}>{r.teacher === null ? '—' : r.teacher}</Text>
            <Text style={[styles.scoreCell, styles.colSymSrc, r.present === 'present' ? styles.statusPass : r.present === 'absent' ? styles.statusFail : styles.statusUnknown]}>
              {r.present === 'present' ? 'קיים' : r.present === 'absent' ? 'לא' : 'לא ברור'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function FindingsPage({ input }: { input: PdfInput }) {
  const childName = `${input.patient.firstName} ${input.patient.lastName}`;
  const { report } = input;
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageName="ממצאים: שאלונים, תצפית ובדיקה" childName={childName} />
      {report.questionnaireFindings ? (<><Text style={styles.h2}>ניתוח ממצאי השאלונים</Text><Paragraphs text={report.questionnaireFindings} /></>) : null}
      {report.observation ? (<><Text style={styles.h2}>תצפית קלינית ובדיקה</Text><Paragraphs text={report.observation} /></>) : null}
      {input.clinicalNotes.length > 0 && (
        <>
          <Text style={styles.h2}>הערות קליניות מהתיק</Text>
          {input.clinicalNotes.map((note, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>-</Text>
              <Text style={styles.bulletText}>[{CATEGORY_HE[note.category] ?? note.category}] {note.content}</Text>
            </View>
          ))}
        </>
      )}
      <PageFooter reportDate={input.reportDate} />
    </Page>
  );
}

function Dsm5Page({ input }: { input: PdfInput }) {
  const childName = `${input.patient.firstName} ${input.patient.lastName}`;
  const { report, dsm5Items } = input;
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageName="ניתוח לפי קריטריוני DSM-5" childName={childName} />
      <Text style={styles.h2}>קריטריוני DSM-5 להפרעת קשב וריכוז</Text>
      <Text style={styles.paragraph}>הטבלה מסכמת את עמידת הממצאים בחמשת הקריטריונים האבחוניים (A–E) של ה-DSM-5, על בסיס השאלונים, הראיון האנמנסטי והבדיקה הקלינית.</Text>
      <View style={styles.scoreTable}>
        <View style={styles.scoreHeaderRow}>
          <Text style={[styles.scoreHeaderCell, styles.colCrit]}>קריט׳</Text>
          <Text style={[styles.scoreHeaderCell, styles.colCritTitle]}>נושא</Text>
          <Text style={[styles.scoreHeaderCell, styles.colCritFinding]}>ממצא</Text>
          <Text style={[styles.scoreHeaderCell, styles.colCritStatus]}>סטטוס</Text>
        </View>
        {report.dsm5.map((c, i) => (
          <View key={c.criterion} style={i % 2 === 0 ? styles.scoreRow : styles.scoreRowAlt} wrap={false}>
            <Text style={[styles.scoreCell, styles.colCrit, { fontWeight: 700 }]}>{c.criterion}</Text>
            <Text style={[styles.scoreCell, styles.colCritTitle]}>{c.title}</Text>
            <Text style={[styles.scoreCell, styles.colCritFinding]}>{c.finding}</Text>
            <Text style={[styles.scoreCell, styles.colCritStatus, statusStyle(c.status)]}>{STATUS_HE[c.status]}</Text>
          </View>
        ))}
      </View>
      {dsm5Items && (
        <>
          <Text style={styles.h2}>פירוט תסמיני קריטריון A</Text>
          <Text style={styles.paragraph}>ציוני ההורה והמורה הם ציוני NICHQ Vanderbilt (0 = אף פעם, 3 = לעיתים קרובות מאוד); ציון 2–3 נחשב תסמין. עמודת "קביעה" משקפת את שיקול הדעת הקליני הסופי.</Text>
          <SymptomTable title="A1 – חוסר קשב" rows={dsm5Items.inattention} count={dsm5Items.inattentionCount} threshold={dsm5Items.threshold} />
          <SymptomTable title="A2 – היפראקטיביות / אימפולסיביות" rows={dsm5Items.hyperactivity} count={dsm5Items.hyperactivityCount} threshold={dsm5Items.threshold} />
        </>
      )}
      <PageFooter reportDate={input.reportDate} />
    </Page>
  );
}

function ImpressionAndDiagnosisPage({ input }: { input: PdfInput }) {
  const childName = `${input.patient.firstName} ${input.patient.lastName}`;
  const { report } = input;
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageName="התרשמות קלינית ואבחנה" childName={childName} />
      <Text style={styles.h2}>התרשמות קלינית</Text>
      <Paragraphs text={report.clinicalImpression} />
      <Text style={styles.h2}>{report.reportKind === 'preliminary' ? 'רושם אבחוני ראשוני' : 'אבחנה'}</Text>
      <View style={styles.diagBox} wrap={false}>
        <Text style={styles.diagText}>{report.diagnosis}</Text>
      </View>
      {report.presentationAndSeverity ? (<><Text style={styles.h3}>הצגה קלינית ודרגת חומרה</Text><Paragraphs text={report.presentationAndSeverity} /></>) : null}
      {report.differential ? (<><Text style={styles.h2}>אבחנה מבדלת ותחלואה נלווית</Text><Paragraphs text={report.differential} /></>) : null}
      <PageFooter reportDate={input.reportDate} />
    </Page>
  );
}

function RecommendationsPage({ input }: { input: PdfInput }) {
  const childName = `${input.patient.firstName} ${input.patient.lastName}`;
  const { report } = input;
  const renderList = (title: string, items: string[]) => {
    if (!items || items.length === 0) return null;
    return (
      <View>
        <Text style={styles.h3}>{title}</Text>
        {items.map((it, i) => (
          <View key={i} style={styles.bulletRow}>
            <Text style={styles.bulletDot}>{i + 1}</Text>
            <Text style={styles.bulletText}>{it}</Text>
          </View>
        ))}
      </View>
    );
  };
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageName="המלצות וסיכום" childName={childName} />
      <Text style={styles.h2}>המלצות</Text>
      {renderList('להורים', report.recommendations.parents)}
      {renderList('לצוות החינוכי – התאמות והתערבות', report.recommendations.educational)}
      {renderList('רפואיות', report.recommendations.medical)}
      {renderList('טיפוליות ומשלימות', report.recommendations.therapeutic)}
      {report.recommendations.followUp ? (<><Text style={styles.h3}>מעקב והמשך</Text><Paragraphs text={report.recommendations.followUp} /></>) : null}
      {report.summary ? (
        <View style={styles.summaryBox} wrap={false}>
          <Text style={[styles.h3, { marginTop: 0 }]}>סיכום</Text>
          <Paragraphs text={report.summary} />
        </View>
      ) : null}
      {report.disclaimers && report.disclaimers.length > 0 && (
        <View style={styles.disclaimerBox} wrap={false}>
          <Text style={styles.disclaimerTitle}>הערות חשובות</Text>
          {report.disclaimers.map((d, i) => (<Text key={i} style={styles.disclaimerText}>• {d}</Text>))}
        </View>
      )}
      <View style={styles.signatureBlock} wrap={false}>
        <Text style={styles.signatureName}>{input.clinicianName}</Text>
        <Text style={styles.signatureTitle}>{input.clinicianTitle}</Text>
        <Text style={[styles.signatureTitle, { marginTop: 8 }]}>תאריך: {input.reportDate}</Text>
      </View>
      <PageFooter reportDate={input.reportDate} />
    </Page>
  );
}

function ReportDocument({ input }: { input: PdfInput }) {
  const hasFindings = Boolean(input.report.questionnaireFindings || input.report.observation || input.clinicalNotes.length);
  return (
    <Document
      title={`דוח אבחון ADHD - ${input.patient.firstName} ${input.patient.lastName}`}
      author="Magic Kids Institute"
      subject="ADHD Diagnostic Report (DSM-5, NICHQ Vanderbilt)"
    >
      <CoverPage input={input} />
      <BackgroundPage input={input} />
      {input.parentScore && <ScorePage input={input} score={input.parentScore} respondentLabel="הורה" />}
      {input.teacherScore && <ScorePage input={input} score={input.teacherScore} respondentLabel="מורה" />}
      {hasFindings && <FindingsPage input={input} />}
      <Dsm5Page input={input} />
      <ImpressionAndDiagnosisPage input={input} />
      <RecommendationsPage input={input} />
    </Document>
  );
}

export async function generatePdfReport(input: PdfInput): Promise<Buffer> {
  const buffer = await renderToBuffer(<ReportDocument input={input} />);
  return buffer;
}
