import { FUND_HE, type Fund } from './payments';
import type { Clinic, VisitType } from './schedule';

/** Staff-facing lines in the calendar event of an ADHD booking: fund, MOXO request and how the visit is paid. */
export function fundLines(clinic: Clinic, body: { fund?: string; maccabiSheli?: boolean; moxo?: boolean }, visitType: VisitType) {
  if (clinic !== 'adhd' || !body.fund) return '';
  const f = body.fund as Fund;
  const lines = [`קופה: ${FUND_HE[f]}${f === 'maccabi' ? (body.maccabiSheli ? ' (מכבי שלי)' : ' (ללא מכבי שלי)') : ''}`];
  if (visitType === 'assessment') lines.push(`מבדק MOXO: ${body.moxo ? 'מבוקש' : 'לא מבוקש'}${f === 'maccabi' && body.moxo && !body.maccabiSheli ? ' — ללא מכבי שלי: בתשלום 944 ₪' : ''}`);
  // A MOXO test through Maccabi depends on a valid referral: the family is asked to send it, staff check eligibility.
  if (visitType === 'assessment' && f === 'maccabi' && body.moxo) lines.push('הפניה ל־MOXO: המשפחה התבקשה לשלוח הפניה מהרופא המפנה. לוודא שההפניה בתוקף ולבדוק זכאות במכבי שלי');
  lines.push(f === 'maccabi' ? 'תשלום: העברת כרטיס מכבי בביקור' : 'תשלום: שולם מראש — אסמכתה אושרה בפאנל');
  return lines.join('\n') + '\n';
}
