import type { AnalystSkill } from './types';

export const debtPayoffSkill: AnalystSkill = {
  id: 'debtPayoff',
  focus: `For debt payoff questions, use compareDebtPayoff rather than mental arithmetic. Require an explicit currency when debts span currencies. Explain avalanche versus snowball, interest, payoff time, insufficient-payment warnings, and assumptions without presenting the result as regulated financial advice.`,
};
