export const FUNDS = ['maccabi', 'clalit', 'meuhedet', 'leumit', 'private'] as const;
export type Fund = typeof FUNDS[number];
export type PaidFund = Exclude<Fund, 'maccabi'>;
export const FUND_HE: Record<Fund, string> = { maccabi: 'מכבי', clalit: 'כללית', meuhedet: 'מאוחדת', leumit: 'לאומית', private: 'פרטי / ללא קופה' };

export const VAT = 0.18;
export const PRICES = { assessment: 1200, moxo: 800 } as const;   // before VAT
export const withVat = (n: number) => Math.round(n * (1 + VAT));
/** Follow-up price for non-Maccabi patients is set by the secretary until a fixed price is configured. */
export const FOLLOWUP_PRICE: number | null = null;
export function amountFor(visitType: 'assessment' | 'followup', moxo: boolean): number | null {
  if (visitType === 'followup') return FOLLOWUP_PRICE === null ? null : withVat(FOLLOWUP_PRICE);
  return withVat(PRICES.assessment) + (moxo ? withVat(PRICES.moxo) : 0);
}
export const PAYMENT = { bankAccount: '731-465946', beneficiary: 'מכון ילדי הקסם', bit: '050-995-5137' } as const;

