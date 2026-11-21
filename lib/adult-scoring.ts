/**
 * Scoring of the adult self-report (questions/asrs_adult.ts). Output is an indication for the physician, never a diagnosis.
 *
 * 1. ASRS-v1.1 screener (items 1–6), exactly as published:
 *    – original rule: items 1–3 count from "sometimes", items 4–6 from "often"; 4 or more = positive screen;
 *    – 2024 scoring update: sum of 0–4 per item (0–24), 14 or more = positive; 0–9 low negative, 10–13 high negative,
 *      14–17 low positive, 18–24 high positive.
 * 2. DSM-5 symptom count over all 18 items: a symptom counts when rated "often" or "very often".
 *    Adults (17+) need 5 of 9 in a domain.
 * 3. Childhood (items 19–22): at least two statements endorsed suggests onset before age 12 (criterion B).
 * 4. Impairment (items 23–28): domains rated "moderately" or more; two or more suggests criteria C–D.
 */
import { ASRS_ADULT_QUESTIONS, type AdultPart } from '@/questions/asrs_adult';

export const ADULT_ENGINE_VERSION = 'adult-asrs-dsm5-v1';
export const ADULT_SYMPTOM_THRESHOLD = 5;
type Responses = Record<string, number> | null | undefined;
const val = (r: Responses, id: number) => { const v = r?.[String(id)]; return typeof v === 'number' && Number.isInteger(v) ? v : null; };

export function adultResponsesComplete(responses: Responses) {
  return !!responses && ASRS_ADULT_QUESTIONS.every(q => { const v = val(responses, q.id); return v !== null && v >= 0 && v <= q.max; });
}
/** The answer falls in the shaded (scoring) range of the official screener form. */
export const screenerShaded = (id: number, value: number) => id >= 1 && id <= 6 && value >= (id <= 3 ? 2 : 3);
/** Lowest shaded option per screener item, for showing the official shading to staff. */
export const screenerShadeFrom = (id: number) => (id <= 3 ? 2 : 3);

export type AdultScore = ReturnType<typeof scoreAdult>;
export function scoreAdult(responses: Responses) {
  const of = (part: AdultPart) => ASRS_ADULT_QUESTIONS.filter(q => q.part === part);
  const screener = of('A');
  const screenerCount = screener.filter(q => screenerShaded(q.id, val(responses, q.id) ?? 0)).length;
  const screenerSum = screener.reduce((sum, q) => sum + (val(responses, q.id) ?? 0), 0);
  const screenerBand = screenerSum >= 18 ? 'high_positive' : screenerSum >= 14 ? 'low_positive' : screenerSum >= 10 ? 'high_negative' : 'low_negative';
  const symptoms = ASRS_ADULT_QUESTIONS.filter(q => q.dsm).map(q => ({ id: q.id, code: q.dsm!, domain: q.domain!, value: val(responses, q.id), present: (val(responses, q.id) ?? 0) >= 3 }));
  const inattention = symptoms.filter(x => x.domain === 'inattention' && x.present).length;
  const hyperactivity = symptoms.filter(x => x.domain === 'hyperactivity' && x.present).length;
  const inattentionMet = inattention >= ADULT_SYMPTOM_THRESHOLD, hyperactivityMet = hyperactivity >= ADULT_SYMPTOM_THRESHOLD;
  const presentation = inattentionMet && hyperactivityMet ? 'combined' : inattentionMet ? 'inattentive' : hyperactivityMet ? 'hyperactive_impulsive' : 'none';
  const childhood = of('childhood').map(q => val(responses, q.id));
  const childhoodCount = childhood.filter(v => v === 1 || v === 2).length;
  const childhoodOnset = childhoodCount >= 2 ? 'likely' : childhood.every(v => v === 3 || v === null) ? 'unknown' : 'not_reported';
  const impairedDomains = of('impairment').filter(q => (val(responses, q.id) ?? 0) >= 2).map(q => q.id);
  const screenerPositive = screenerCount >= 4, screenerPositive24 = screenerSum >= 14;
  return {
    screenerCount, screenerPositive, screenerSum, screenerPositive24, screenerBand,
    inattention, hyperactivity, inattentionMet, hyperactivityMet, presentation, symptoms,
    childhoodCount, childhoodOnset, impairedDomains, impairmentMulti: impairedDomains.length >= 2,
    raw: { screener_count: screenerCount, screener_sum: screenerSum, inattention_count: inattention, hyperactivity_count: hyperactivity, childhood_count: childhoodCount, impaired_domains: impairedDomains.length },
    flags: { screener_positive: screenerPositive, screener_positive_24: screenerPositive24, inattention_met: inattentionMet, hyperactivity_met: hyperactivityMet, childhood_onset_reported: childhoodOnset === 'likely', impairment_two_domains: impairedDomains.length >= 2 },
  };
}
