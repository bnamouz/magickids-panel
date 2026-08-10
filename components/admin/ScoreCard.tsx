import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

const CATEGORY_LABELS: Record<string, string> = {
  inattention_count: 'חוסר קשב',
  hyperactivity_count: 'היפראקטיביות',
  odd_count: 'ODD (התנגדות)',
  cd_count: 'CD (התנהגות)',
  odd_cd_count: 'ODD/CD',
  anxiety_dep_count: 'חרדה/מצב רוח',
  function_impairment: 'פגיעה בתפקוד',
  academic_impairment: 'פגיעה אקדמית',
  behavioral_impairment: 'פגיעה התנהגותית',
};

const PRESENTATION_LABELS: Record<string, { label: string; color: string }> = {
  combined: { label: 'פרופיל משולב (Combined)', color: 'bg-red-100 text-red-700' },
  inattentive: { label: 'פרופיל קשב דומיננטי', color: 'bg-orange-100 text-orange-700' },
  hyperactive: { label: 'היפראקטיביות דומיננטית', color: 'bg-orange-100 text-orange-700' },
  subthreshold: { label: 'תת-סף – דורש בירור', color: 'bg-yellow-100 text-yellow-700' },
  no_adhd: { label: 'אין עמידה בקריטריונים', color: 'bg-green-100 text-green-700' },
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: 'ביטחון גבוה',
  medium: 'ביטחון בינוני',
  low: 'ביטחון נמוך',
};

export default function ScoreCard({
  score,
  title,
  primary = false,
}: {
  score: any;
  title: string;
  primary?: boolean;
}) {
  const raw = score.raw_scores as Record<string, number>;
  const flags = score.flags as Record<string, boolean>;
  const presentation = score.presentation as string | null;
  const confidence = score.confidence as string | null;

  return (
    <div className={`card ${primary ? 'border-r-4 border-r-[#01696f]' : ''}`}>
      <div className="flex justify-between items-start mb-4">
        <h2 className={`font-bold ${primary ? 'text-xl text-[#01696f]' : 'text-slate-800'}`}>{title}</h2>
        {presentation && (
          <div className="flex flex-col items-end gap-1">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${PRESENTATION_LABELS[presentation]?.color ?? 'bg-slate-100'}`}>
              {PRESENTATION_LABELS[presentation]?.label ?? presentation}
            </span>
            {confidence && (
              <span className="text-xs text-slate-500">{CONFIDENCE_LABELS[confidence] ?? confidence}</span>
            )}
          </div>
        )}
      </div>

      {/* Raw scores grid */}
      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        {Object.entries(raw ?? {}).map(([key, value]) => {
          const flagKey = key.replace('_count', '_positive').replace('_impairment', '_impaired');
          const positive = flags?.[flagKey] ?? flags?.[`${key.split('_')[0]}_positive`];
          return (
            <div key={key} className="flex items-center justify-between bg-slate-50 rounded p-2">
              <span className="text-slate-700 text-xs">{CATEGORY_LABELS[key] ?? key}</span>
              <span className="flex items-center gap-1">
                <span className={`font-bold ${positive ? 'text-red-600' : 'text-slate-700'}`}>{value}</span>
                {positive === true && <CheckCircle2 size={14} className="text-red-500" />}
                {positive === false && <XCircle size={14} className="text-slate-300" />}
              </span>
            </div>
          );
        })}
      </div>

      {/* Alerts */}
      {score.alerts && Array.isArray(score.alerts) && score.alerts.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
            <AlertTriangle size={12} className="text-orange-500" /> אזהרות
          </div>
          <ul className="text-xs text-slate-700 space-y-1">
            {score.alerts.map((a: string, i: number) => (
              <li key={i}>• {a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-xs text-slate-400 mt-3">
        מנוע: {score.engine_version} · {new Date(score.created_at).toLocaleString('he-IL')}
      </div>
    </div>
  );
}
