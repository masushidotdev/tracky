import type { AnalystSkill } from './types';

export const purchaseSkill: AnalystSkill = {
  id: 'purchase',
  focus: `For an ask-before-you-buy request, first obtain the exact amount, ISO currency, and intended purchase date. Use simulateWhatIf with a oneOffExpense; then compare the result with cashflow, relevant Plan buckets, money-box funding, and debt commitments. Never invent or perform foreign-exchange conversion. Give a transparent verdict (comfortable, tight, or not advisable), list the assumptions and evidence, and offer lower-cost or later-date alternatives. The verdict is guidance, not a guarantee or financial advice.`,
};
