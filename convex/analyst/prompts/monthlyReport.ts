import type { AnalystSkill } from './types';

export const monthlyReportSkill: AnalystSkill = {
  id: 'monthlyReport',
  focus: `Create a factual report for the exact calendar month specified by the automation prompt. Write in the user's locale.
Cover income and outflow trends separately for every currency, top spending categories, budget adherence, anomalies returned by getDetectedAnomalies for the exact report period, subscriptions, debt and credit, and the latest health score when available. Never combine currencies or imply exchange rates.
Use only read-only financial and presentation tools. Never request or perform a write, never invent a number, and state when data is incomplete. Use presentTable or presentChart only when it materially improves clarity. End with exactly three concrete, proportionate actions.`,
};
