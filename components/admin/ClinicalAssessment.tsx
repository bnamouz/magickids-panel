'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  COMORBIDITIES, DIFFERENTIALS, DSM5_HYPERACTIVITY, DSM5_INATTENTION, IMPAIRMENT_DOMAINS, PLAN_OPTIONS, SETTINGS,
  ageYears, emptyAssessment, evaluateDsm5, effectivePresence, type ClinicalAssessment as Data, type Presence, type Tri,
} from '@/lib/adhd/dsm5';

type Evidence = Record<string, { parent: number | null; teacher: number | null; parentPositive: boolean; teacherPositive: boolean }>;
type Loaded = { assessment: Data; updatedAt: string | null; evidence: Evidence; hasParent: boolean; hasTeacher: boolean; birthDate: string | null; canEdit: boolean };

const SCORE_HE = ['אף פעם', 'לעיתים', 'לעיתים קרובות', 'לעיתים קרובות מאוד'];
const fmt = (iso: string) => new Date(iso).toLocaleString('he-IL-u-nu-latn', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });

type Tone = 'teal' | 'amber' | 'slate';
function Chip({ on, children, onClick, tone = 'teal', disabled }: { on: boolean; children: React.ReactNode; onClick: () => void; tone?: Tone; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${on ? (tone === 'amber' ? 'border-amber-500 bg-amber-50 text-amber-900' : tone === 'slate' ? 'border-slate-500 bg-slate-100 text-slate-800' : 'border-[#01696f] bg-teal-50 text-[#01696f]') : 'border-slate-300 text-slate-600 hover:bg-slate-50'} disabled:cursor-default`}>{children}</button>
  );
}
function TriPick({ value, onChange, disabled }: { value: Tri; onChange: (v: Tri) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Chip disabled={disabled} on={value === 'yes'} onClick={() => onChange('yes')}>כן</Chip>
      <Chip disabled={disabled} on={value === 'no'} onClick={() => onChange('no')} tone="amber">לא</Chip>
      <Chip disabled={disabled} on={value === 'unknown'} onClick={() => onChange('unknown')} tone="slate">לא ידוע</Chip>
    </div>
  );
}
function Area({ label, value, onChange, rows = 3, hint, readOnly }: { label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string; readOnly?: boolean }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">{label}
      {hint && <span className="mr-2 text-xs font-normal text-slate-500">{hint}</span>}
      <textarea rows={rows} readOnly={readOnly} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm font-normal leading-6" />
    </label>
  );
}

export default function ClinicalAssessment({ sessionId }: { sessionId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [data, setData] = useState<Data>(emptyAssessment());
  const [dirty, setDirty] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(''), [savedAt, setSavedAt] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(data); latest.current = data;

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/sessions/${sessionId}/assessment`, { cache: 'no-store' }).then(async (r) => {
      if (!r.ok) throw new Error('load'); const j = (await r.json()) as Loaded;
      if (!alive) return; setLoaded(j); setData(j.assessment); setSavedAt(j.updatedAt);
      setOpen(!j.assessment.conclusion);
    }).catch(() => alive && setError('לא ניתן לטעון את ההערכה הקלינית. רעננו את הדף.'));
    return () => { alive = false; };
  }, [sessionId]);

  const save = useCallback(async () => {
    if (!loaded?.canEdit) return;
    setSaving(true); setError('');
    try {
      const r = await fetch(`/api/admin/sessions/${sessionId}/assessment`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assessment: latest.current }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error === 'forbidden' ? 'אין הרשאה לשמור הערכה קלינית.' : 'השמירה נכשלה. נסו שוב.');
      setSavedAt(j.updatedAt); setDirty(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'השמירה נכשלה.'); } finally { setSaving(false); }
  }, [loaded?.canEdit, sessionId]);

  const update = (patch: Partial<Data>) => {
    setData((d) => ({ ...d, ...patch })); setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 1500);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const toggle = (key: keyof Pick<Data, 'settings' | 'impairmentDomains' | 'differentialsExcluded' | 'comorbidities' | 'plan'>, v: string) =>
    update({ [key]: data[key].includes(v) ? data[key].filter((x) => x !== v) : [...data[key], v] } as Partial<Data>);

  if (error && !loaded) return <section className="card" dir="rtl"><p className="text-sm text-red-700">{error}</p></section>;
  if (!loaded) return <section className="card" dir="rtl"><p className="text-sm text-slate-500">טוען הערכה קלינית…</p></section>;

  const ev = loaded.evidence, age = ageYears(loaded.birthDate), ro = !loaded.canEdit;
  const result = evaluateDsm5(data, ev, age);
  const filled = Object.keys(data.symptoms).length;

  const symptomRow = (s: { code: string; he: string }) => {
    const e = ev[s.code], val: Presence = effectivePresence(s.code, data, ev), own = data.symptoms[s.code];
    const cell = (v: number | null, who: string) => v === null ? <span className="text-slate-300">—</span> : <span title={`${who}: ${SCORE_HE[v] ?? v}`} className={`inline-block min-w-[1.6rem] rounded px-1 text-center text-xs font-bold ${v >= 2 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>{v}</span>;
    const set = (p: Presence) => update({ symptoms: own === p ? Object.fromEntries(Object.entries(data.symptoms).filter(([k]) => k !== s.code)) : { ...data.symptoms, [s.code]: p } });
    return (
      <tr key={s.code} className={val === 'present' ? 'bg-teal-50/60' : ''}>
        <td className="py-1.5 pl-2 text-xs text-slate-500">{s.code}</td>
        <td className="py-1.5 pl-2 text-sm">{s.he}</td>
        <td className="py-1.5 text-center">{cell(e?.parent ?? null, 'הורה')}</td>
        <td className="py-1.5 text-center">{cell(e?.teacher ?? null, 'מורה')}</td>
        <td className="py-1.5">
          <div className="flex justify-end gap-1">
            {(['present', 'absent', 'unclear'] as Presence[]).map((p) => (
              <button key={p} type="button" disabled={ro} onClick={() => set(p)} title={own ? 'שיקול דעת קליני' : 'לפי השאלונים (לחיצה קובעת ידנית)'}
                className={`rounded px-2 py-0.5 text-xs font-semibold border ${val === p ? (p === 'present' ? 'border-[#01696f] bg-[#01696f] text-white' : p === 'absent' ? 'border-slate-500 bg-slate-600 text-white' : 'border-amber-500 bg-amber-500 text-white') : 'border-slate-200 text-slate-500 hover:bg-slate-50'} ${own && val === p ? 'ring-2 ring-offset-1 ring-teal-300' : ''}`}>
                {p === 'present' ? 'קיים' : p === 'absent' ? 'לא' : '?'}
              </button>
            ))}
          </div>
        </td>
      </tr>
    );
  };
  const table = (title: string, list: readonly { code: string; he: string }[], n: number, met: boolean) => (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-semibold text-slate-800">{title}</h4>
        <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${met ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>{n}/9 תסמינים · סף {result.threshold}{met ? ' · עומד בסף' : ''}</span>
      </div>
      <table className="w-full text-right">
        <thead><tr className="text-xs text-slate-500"><th className="pl-2 font-normal">קוד</th><th className="pl-2 font-normal">תסמין DSM-5</th><th className="font-normal">הורה</th><th className="font-normal">מורה</th><th className="text-left font-normal">שיקול דעת קליני</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{list.map(symptomRow)}</tbody>
      </table>
    </div>
  );

  return (
    <section className="card space-y-5 scroll-mt-24" id="clinical-assessment" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">הערכה קלינית – קריטריוני DSM-5 להפרעת קשב</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">ממולא על ידי הרופא/ה המאבחן/ת במהלך האבחון. עמודות הורה/מורה מציגות את ציוני Vanderbilt (0–3; ציון 2–3 נחשב תסמין). ההחלטה הסופית לכל תסמין היא שלכם. הנתונים נשמרים אוטומטית ומשולבים בדוח בלחיצה על "הפקת דוח".</p>
        </div>
        <div className="text-left text-xs text-slate-500">
          {saving ? 'שומר…' : dirty ? 'שינויים לא נשמרו' : savedAt ? `נשמר ${fmt(savedAt)}` : 'טרם נשמר'}
          {ro && <div className="mt-1 text-amber-700">צפייה בלבד (עריכה: מנהל / מאבחן)</div>}
          <button type="button" className="mt-1 block underline" onClick={() => setOpen((o) => !o)}>{open ? 'כיווץ' : 'הרחבה'}</button>
        </div>
      </header>

      <div className="grid gap-2 sm:grid-cols-5 text-xs">
        {[
          ['A', 'תסמינים', result.criteriaA, `${result.inattention} קשב · ${result.hyperactivity} היפר׳`],
          ['B', 'לפני גיל 12', result.criteriaB === 'yes', result.criteriaB === 'yes' ? 'אושר' : result.criteriaB === 'no' ? 'לא' : 'לא ידוע'],
          ['C', 'שתי מסגרות', result.criteriaC, `${data.settings.length} מסגרות`],
          ['D', 'פגיעה תפקודית', result.criteriaD, `${data.impairmentDomains.length} תחומים`],
          ['E', 'שלילת הסבר אחר', result.criteriaE === 'yes', result.criteriaE === 'yes' ? 'אושר' : result.criteriaE === 'no' ? 'לא' : 'לא ידוע'],
        ].map(([k, label, ok, detail]) => (
          <div key={String(k)} className={`rounded-lg border p-2 ${ok ? 'border-[#01696f] bg-teal-50' : 'border-slate-200 bg-slate-50'}`}>
            <div className="font-bold text-slate-800">{String(k)} · {String(label)}</div>
            <div className={ok ? 'text-[#01696f]' : 'text-slate-500'}>{String(detail)}</div>
          </div>
        ))}
      </div>
      <div className={`rounded-lg p-3 text-sm ${result.allMet ? 'bg-teal-50 text-teal-900' : 'bg-slate-50 text-slate-700'}`}>
        <b>סיכום אוטומטי:</b> {result.allMet ? `כל הקריטריונים מתקיימים – ${result.presentationHe} (${result.icd10}).` : `${result.presentationHe}${result.icd10 ? ` (${result.icd10})` : ''}. חסר: ${result.missing.join('; ')}.`}
        {age !== null && age >= 17 && <span className="mr-1 text-xs">(גיל 17+ – סף 5 תסמינים)</span>}
        {filled === 0 && <span className="mr-1 text-xs text-slate-500">– עדיין לא סומנו תסמינים ידנית; הספירה לפי השאלונים בלבד.</span>}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {open && <fieldset className="space-y-6">
        <div className="space-y-3">
          <h3 className="font-bold text-slate-800">קריטריון A – תסמינים {!loaded.hasParent && <span className="text-xs font-normal text-amber-700">(אין שאלון הורה מלא)</span>}{!loaded.hasTeacher && <span className="mr-1 text-xs font-normal text-amber-700">(אין שאלון מורה)</span>}</h3>
          {table('A1 – חוסר קשב', DSM5_INATTENTION, result.inattention, result.inattentionMet)}
          {table('A2 – היפראקטיביות / אימפולסיביות', DSM5_HYPERACTIVITY, result.hyperactivity, result.hyperactivityMet)}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <h3 className="font-bold text-slate-800">קריטריון B – הופעה לפני גיל 12</h3>
            <TriPick disabled={ro} value={data.onsetBefore12} onChange={(v) => update({ onsetBefore12: v })} />
            <label className="block text-sm">גיל הופעה משוער <input readOnly={ro} value={data.onsetAge ?? ''} onChange={(e) => update({ onsetAge: e.target.value })} className="mr-2 w-24 rounded border border-slate-300 p-1 text-sm" placeholder="למשל 5" /></label>
            <Area label="פירוט" value={data.onsetNotes ?? ''} onChange={(v) => update({ onsetNotes: v })} readOnly={ro} rows={2} hint="מתי ומי הבחין לראשונה" />
          </div>
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <h3 className="font-bold text-slate-800">קריטריון C – נוכחות בשתי מסגרות לפחות</h3>
            <div className="flex flex-wrap gap-2">{SETTINGS.map(([k, he]) => <Chip disabled={ro} key={k} on={data.settings.includes(k)} onClick={() => toggle('settings', k)}>{he}</Chip>)}</div>
            <Area label="פירוט" value={data.settingsNotes ?? ''} onChange={(v) => update({ settingsNotes: v })} readOnly={ro} rows={2} />
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <h3 className="font-bold text-slate-800">קריטריון D – ממצאי הפגיעה התפקודית</h3>
          <div className="flex flex-wrap gap-2">{IMPAIRMENT_DOMAINS.map(([k, he]) => <Chip disabled={ro} key={k} on={data.impairmentDomains.includes(k)} onClick={() => toggle('impairmentDomains', k)}>{he}</Chip>)}</div>
          <div className="flex flex-wrap items-center gap-2 text-sm">חומרת הפגיעה:
            {(['mild', 'moderate', 'severe'] as const).map((s) => <Chip disabled={ro} key={s} on={data.impairmentSeverity === s} onClick={() => update({ impairmentSeverity: data.impairmentSeverity === s ? '' : s })} tone="amber">{{ mild: 'קלה', moderate: 'בינונית', severe: 'חמורה' }[s]}</Chip>)}
          </div>
          <Area label="תיאור הממצאים" value={data.impairmentFindings ?? ''} onChange={(v) => update({ impairmentFindings: v })} readOnly={ro} rows={4} hint="הישגים לימודיים, יחסים חברתיים, תפקוד בבית, דימוי עצמי – דוגמאות קונקרטיות" />
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <h3 className="font-bold text-slate-800">קריטריון E – אבחנה מבדלת ושלילת הסברים חלופיים</h3>
          <p className="text-xs text-slate-500">סמנו מצבים שנבדקו ונשללו (או אינם מסבירים את התמונה):</p>
          <div className="flex flex-wrap gap-2">{DIFFERENTIALS.map(([k, he]) => <Chip disabled={ro} key={k} on={data.differentialsExcluded.includes(k)} onClick={() => toggle('differentialsExcluded', k)}>{he}</Chip>)}</div>
          <Area label="הערות אבחנה מבדלת" value={data.differentialNotes ?? ''} onChange={(v) => update({ differentialNotes: v })} readOnly={ro} rows={2} />
          <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">התסמינים אינם מוסברים טוב יותר על ידי הפרעה אחרת: <TriPick disabled={ro} value={data.notBetterExplained} onChange={(v) => update({ notBetterExplained: v })} /></div>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <h3 className="font-bold text-slate-800">תחלואה נלווית (קומורבידיות)</h3>
          <div className="flex flex-wrap gap-2">{COMORBIDITIES.map(([k, he]) => <Chip disabled={ro} key={k} on={data.comorbidities.includes(k)} onClick={() => toggle('comorbidities', k)} tone="amber">{he}</Chip>)}</div>
          <Area label="פירוט" value={data.comorbidityNotes ?? ''} onChange={(v) => update({ comorbidityNotes: v })} readOnly={ro} rows={2} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Area label="תצפית קלינית במהלך האבחון" value={data.observation ?? ''} onChange={(v) => update({ observation: v })} readOnly={ro} rows={5} hint="קשר עין, שיתוף פעולה, רמת פעילות, אימפולסיביות, שפה, מצב רוח, התמדה במטלות" />
          <Area label="היסטוריה התפתחותית" value={data.developmentalHistory ?? ''} onChange={(v) => update({ developmentalHistory: v })} readOnly={ro} rows={5} hint="הריון, לידה, אבני דרך מוטוריות ושפתיות, גן" />
          <Area label="היסטוריה רפואית" value={data.medicalHistory ?? ''} onChange={(v) => update({ medicalHistory: v })} readOnly={ro} rows={4} hint="מחלות, אשפוזים, תרופות, אלרגיות, שינה, תיאבון, שמיעה/ראייה" />
          <Area label="היסטוריה משפחתית" value={data.familyHistory ?? ''} onChange={(v) => update({ familyHistory: v })} readOnly={ro} rows={4} hint="ADHD, לקויות למידה, הפרעות נפשיות במשפחה" />
          <Area label="תפקוד לימודי והיסטוריה בית-ספרית" value={data.schoolHistory ?? ''} onChange={(v) => update({ schoolHistory: v })} readOnly={ro} rows={4} hint="הישגים, הערכות קודמות, התאמות קיימות, שיעורי עזר" />
          <Area label="בדיקה גופנית ונוירולוגית" value={data.physicalExam ?? ''} onChange={(v) => update({ physicalExam: v })} readOnly={ro} rows={4} hint="גובה/משקל, ל״ד, דופק, בדיקה נוירולוגית, טיקים, דיסמורפיזם" />
          <Area label="בדיקות ואבחונים נוספים" value={data.testsResults ?? ''} onChange={(v) => update({ testsResults: v })} readOnly={ro} rows={3} hint="MOXO/TOVA, אבחון דידקטי, שמיעה, ראייה, מעבדה" />
          <Area label="חוזקות ומשאבים של הילד/ה" value={data.strengths ?? ''} onChange={(v) => update({ strengths: v })} readOnly={ro} rows={3} />
        </div>

        <div className="space-y-3 rounded-xl border-2 border-[#01696f]/40 p-3">
          <h3 className="font-bold text-slate-800">סיכום אבחוני</h3>
          <div className="flex flex-wrap items-center gap-2 text-sm">מסקנה:
            {([['adhd', 'ADHD – עומד/ת בקריטריונים'], ['not_met', 'אינו/ה עומד/ת בקריטריונים'], ['needs_more', 'נדרש מידע / הערכה נוספת']] as const).map(([k, he]) => <Chip disabled={ro} key={k} on={data.conclusion === k} onClick={() => update({ conclusion: data.conclusion === k ? '' : k })} tone={k === 'adhd' ? 'teal' : k === 'not_met' ? 'slate' : 'amber'}>{he}</Chip>)}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">הצגה קלינית (ברירת מחדל: {result.presentationHe}):
            {([['combined', 'משולבת'], ['inattentive', 'חוסר קשב'], ['hyperactive_impulsive', 'היפר׳/אימפולסיבית']] as const).map(([k, he]) => <Chip disabled={ro} key={k} on={data.presentationOverride === k} onClick={() => update({ presentationOverride: data.presentationOverride === k ? '' : k })}>{he}</Chip>)}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">חומרה כוללת:
            {(['mild', 'moderate', 'severe'] as const).map((s) => <Chip disabled={ro} key={s} on={data.severity === s} onClick={() => update({ severity: data.severity === s ? '' : s })} tone="amber">{{ mild: 'קלה', moderate: 'בינונית', severe: 'חמורה' }[s]}</Chip>)}
          </div>
          <div>
            <div className="mb-1 text-sm font-semibold">תוכנית טיפול מומלצת</div>
            <div className="flex flex-wrap gap-2">{PLAN_OPTIONS.map(([k, he]) => <Chip disabled={ro} key={k} on={data.plan.includes(k)} onClick={() => toggle('plan', k)}>{he}</Chip>)}</div>
          </div>
          {data.plan.includes('medication') && <Area label="פירוט טיפול תרופתי" value={data.medicationPlan ?? ''} onChange={(v) => update({ medicationPlan: v })} readOnly={ro} rows={2} hint="תכשיר, מינון התחלתי, מעקב" />}
          <Area label="הערות לתוכנית ולדוח" value={data.planNotes ?? ''} onChange={(v) => update({ planNotes: v })} readOnly={ro} rows={3} hint="כל דגש שתרצו שייכלל בדוח" />
        </div>

        {!ro && <div className="flex items-center gap-3">
          <button type="button" onClick={() => { if (timer.current) clearTimeout(timer.current); void save(); }} disabled={saving} className="btn-primary">שמירת ההערכה</button>
          <span className="text-xs text-slate-500">השמירה מתבצעת גם אוטומטית כ־1.5 שניות אחרי כל שינוי.</span>
        </div>}
      </fieldset>}
    </section>
  );
}
