import { changeReasonLabel, removalReasonLabel, type TreatmentChange } from '@/lib/therapists/change-reasons';

const title: Record<TreatmentChange['kind'], string> = {
  rescheduled: 'שינוי מועד',
  cancelled: 'ביטול תור',
  removed: 'הסרה מהרשימה',
};
const delivery: Partial<Record<string, string>> = {
  accepted: 'התקבלה אצל הספק',
  skipped: 'לא נשלחה',
  pending: 'טרם התקבל אישור שליחה',
  failed: 'שליחה נכשלה',
  unknown: 'לא ידוע אם התקבלה',
  not_configured: 'שליחה אינה מוגדרת',
};
const format = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem', dateStyle: 'medium', timeStyle: 'short',
});
const date = (value: string) =>
  <bdi><time dateTime={value}>{format.format(new Date(value))}</time></bdi>;
const reason = (change: TreatmentChange) => change.reason_label ||
  (change.kind === 'removed' ? removalReasonLabel(change.reason) : changeReasonLabel(change.reason));

export default function TreatmentChangeHistory({
  changes, closed = false, variant,
}: { changes?: readonly TreatmentChange[]; closed?: boolean; variant?: 'diary' | 'portal' }) {
  if (!changes?.length) return null;
  const removal = closed ? changes.find(change => change.kind === 'removed') : undefined;
  return <div dir="rtl" className={variant === 'diary' ? 'rb-change-history' : 'w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm'}>
    {removal && <p className="mb-2"><strong>סיבת ההסרה:</strong> {reason(removal)}</p>}
    <details>
      <summary className="cursor-pointer font-semibold text-teal-800">שינויים אחרונים ({changes.length})</summary>
      <ul className="mt-2 divide-y divide-slate-200">
        {changes.map(change => <li key={change.id} className="grid gap-1 py-2 [overflow-wrap:anywhere]">
          <div><strong>{title[change.kind]}</strong> · {reason(change)}</div>
          {change.previous_at && <div className="flex flex-wrap items-baseline gap-x-2">
            <span>{change.new_at ? 'מועד קודם:' : 'המועד שבוטל:'} {date(change.previous_at)}</span>
            {change.new_at && <span><span aria-hidden="true" className="me-2">←</span>מועד חדש: {date(change.new_at)}</span>}
          </div>}
          {change.note && <div className="whitespace-pre-wrap">
            {change.kind === 'removed' ? 'הערה פנימית: ' : 'הודעת המטפלת: '}<bdi>{change.note}</bdi>
          </div>}
          <div className="flex flex-wrap gap-x-2 text-slate-600">
            <span>תועד: {date(change.created_at)}{change.by === 'staff' ? ' · צוות המכון' : ''}</span>
            <span>WhatsApp: {change.kind === 'removed' ? delivery.skipped : delivery[change.whatsapp ?? 'unknown'] ?? delivery.unknown}</span>
          </div>
        </li>)}
      </ul>
    </details>
  </div>;
}
