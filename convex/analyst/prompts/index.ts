import { budgetingSkill } from './budgeting';
import { coreSkill } from './core';
import { debtSkill } from './debt';
import { debtPayoffSkill } from './debtPayoff';
import { monthlyReportSkill } from './monthlyReport';
import { researchSkill } from './research';
import { spendingReviewSkill } from './spendingReview';
import { subscriptionReviewSkill } from './subscriptionReview';
import { whatIfSkill } from './whatIf';
import { purchaseSkill } from './purchase';
import { fireSkill } from './fire';
import type { AnalystSkill } from './types';

export const analystSkills = [
  budgetingSkill,
  spendingReviewSkill,
  debtSkill,
  debtPayoffSkill,
  researchSkill,
  whatIfSkill,
  purchaseSkill,
  fireSkill,
] as const;

export const proactiveAnalystSkills = [monthlyReportSkill, subscriptionReviewSkill, debtPayoffSkill] as const;

export function buildInstructions({
  locale,
  skills,
  memoryContext,
  approvalContext,
}: {
  locale: string;
  skills?: ReadonlyArray<AnalystSkill>;
  memoryContext?: string;
  approvalContext?: string;
}) {
  const selectedSkills = skills ?? analystSkills;
  return [
    coreSkill.focus,
    `The user's locale is ${locale}.`,
    approvalContext,
    ...selectedSkills.map((skill) => skill.focus),
    memoryContext,
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n\n');
}

export type { AnalystSkill } from './types';
