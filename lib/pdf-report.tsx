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
});

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
      <Text style={styles.footerText}>דוח אבחון NICHQ Vanderbilt · {reportDate}</Text>
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
        <Text style={styles.coverTitle}>דוח אבחון קשב וריכוז</Text>
        <Text style={styles.coverSubtitle}>סקאלת הערכה NICHQ Vanderbilt</Text>

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

function FamilyAndBackgroundPage({ input }: { input: PdfInput }) {
  const childName = `${input.patient.firstName} ${input.patient.lastName}`;

  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageName="פרטי משפחה ורקע" childName={childName} />

      <Text style={styles.h2}>פרטי משפחה</Text>
      <View style={styles.infoGrid}>
        {input.parent && (
          <>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>שם הורה</Text>
              <Text style={styles.infoValue}>{input.parent.fullName}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>קרבה</Text>
              <Text style={styles.infoValue}>{input.parent.relation || 'לא צוין'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>טלפון</Text>
              <Text style={styles.infoValue}>{input.parent.phone}</Text>
            </View>
          </>
        )}
        {input.patient.teacherName && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>שם המורה</Text>
            <Text style={styles.infoValue}>{input.patient.teacherName}</Text>
          </View>
        )}
      </View>

      {input.reasonForReferral && (
        <>
          <Text style={styles.h3}>סיבת ההפניה</Text>
          <Text style={styles.paragraph}>{input.reasonForReferral}</Text>
        </>
      )}

      {input.clinicalNotes.length > 0 && (
        <>
          <Text style={styles.h2}>הערות קליניות</Text>
          {input.clinicalNotes.map((note, i) => (
            <View key={i}>
              <Text style={styles.h3}>{note.category}</Text>
              <Text style={styles.paragraph}>{note.content}</Text>
            </View>
          ))}
        </>
      )}

      <PageFooter reportDate={input.reportDate} />
    </Page>
  );
}

function ScorePage({
  input,
  score,
  respondentLabel,
}: {
  input: PdfInput;
  score: VanderbiltScore;
  respondentLabel: string;
}) {
  const childName = `${input.patient.firstName} ${input.patient.lastName}`;

  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageName={`שאלון ${respondentLabel} - NICHQ Vanderbilt`} childName={childName} />

      <Text style={styles.h2}>ניתוח שאלון {respondentLabel}</Text>
      <Text style={styles.paragraph}>
        השאלון מולא במלואו ({score.completeness}% מהשאלות). ההצגה הקלינית הזוהתה כ:{' '}
        <Text style={{ fontWeight: 700, color: COLORS.primary }}>{score.presentationLabelHe}</Text>.
      </Text>

      <Text style={styles.h3}>סיכום תת-סקאלות</Text>
      <View style={styles.scoreTable}>
        <View style={styles.scoreHeaderRow}>
          <Text style={[styles.scoreHeaderCell, styles.colScale]}>תת-סקאלה</Text>
          <Text style={[styles.scoreHeaderCell, styles.colScore]}>סימפטומים</Text>
          <Text style={[styles.scoreHeaderCell, styles.colThreshold]}>סף</Text>
          <Text style={[styles.scoreHeaderCell, styles.colStatus]}>סטטוס</Text>
        </View>
        {score.subscales.map((s, i) => (
          <View key={s.key} style={i % 2 === 0 ? styles.scoreRow : styles.scoreRowAlt}>
            <Text style={[styles.scoreCell, styles.colScale]}>{s.labelHe}</Text>
            <Text style={[styles.scoreCell, styles.colScore]}>{s.symptomCount}</Text>
            <Text style={[styles.scoreCell, styles.colThreshold]}>{s.threshold}</Text>
            <View style={styles.colStatus}>
              <Text style={[styles.scoreCell, s.meetsThreshold ? styles.statusPass : styles.statusFail]}>
                {s.meetsThreshold ? 'חריג' : 'תקין'}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.h3}>תפקוד בבית ובבית הספר</Text>
      <Text style={styles.paragraph}>{score.performance.interpretation}</Text>

      <Text style={styles.h3}>פרשנות שאלון</Text>
      <Text style={styles.paragraph}>{score.clinicalSummary}</Text>

      <PageFooter reportDate={input.reportDate} />
    </Page>
  );
}

function ImpressionAndDiagnosisPage({ input }: { input: PdfInput }) {
  const childName = `${input.patient.firstName} ${input.patient.lastName}`;
  const { report } = input;

  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageName="התרשמות ואבחנה" childName={childName} />

      <Text style={styles.h2}>התרשמות קלינית</Text>
      <Text style={styles.paragraph}>{report.clinicalImpression}</Text>

      <Text style={styles.h2}>אבחנה</Text>
      <View style={styles.diagBox}>
        <Text style={styles.diagText}>{report.diagnosis}</Text>
      </View>

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
            <Text style={styles.bulletDot}>-</Text>
            <Text style={styles.bulletText}>{it}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageName="המלצות" childName={childName} />

      <Text style={styles.h2}>המלצות</Text>

      {renderList('טיפוליות', report.recommendations.therapeutic)}
      {renderList('חינוכיות', report.recommendations.educational)}
      {renderList('רפואיות', report.recommendations.medical)}

      {report.recommendations.followUp && (
        <>
          <Text style={styles.h3}>מעקב והמשך</Text>
          <Text style={styles.paragraph}>{report.recommendations.followUp}</Text>
        </>
      )}

      {report.disclaimers && report.disclaimers.length > 0 && (
        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerTitle}>הערות חשובות</Text>
          {report.disclaimers.map((d, i) => (
            <Text key={i} style={styles.disclaimerText}>• {d}</Text>
          ))}
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
  return (
    <Document
      title={`דוח אבחון - ${input.patient.firstName} ${input.patient.lastName}`}
      author="Magic Kids Institute"
      subject="NICHQ Vanderbilt ADHD Assessment Report"
    >
      <CoverPage input={input} />
      <FamilyAndBackgroundPage input={input} />
      {input.parentScore && <ScorePage input={input} score={input.parentScore} respondentLabel="הורה" />}
      {input.teacherScore && <ScorePage input={input} score={input.teacherScore} respondentLabel="מורה" />}
      <ImpressionAndDiagnosisPage input={input} />
      <RecommendationsPage input={input} />
    </Document>
  );
}

export async function generatePdfReport(input: PdfInput): Promise<Buffer> {
  const buffer = await renderToBuffer(<ReportDocument input={input} />);
  return buffer;
}
