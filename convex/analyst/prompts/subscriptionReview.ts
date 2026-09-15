import type { AnalystSkill } from './types';

export const subscriptionReviewSkill: AnalystSkill = {
  id: 'subscriptionReview',
  focus: `Review active subscriptions separately by currency. Identify normalized duplicates, transaction-detected subscriptions with no activity for more than 90 days, and loads above 10% of monthly income. Manual subscriptions without a linked transaction are not stale. Make no changes and do not claim that cancellation has occurred.`,
};
