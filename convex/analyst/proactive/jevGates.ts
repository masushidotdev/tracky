// Shared jev question sets + pure routing for the proactive gates
// (UC4 anomaly notifier, E1 report-skip, E2 health-driver, UC3 subscription).
// Pure functions stay here for unit tests; Convex actions live in jobs.ts and
// call decide() directly so failures fall closed to deterministic paths.
import { JEV_ANOMALY, JEV_REPORT_SKIP } from '../../lib/jevThresholds';

export const anomalyGateQuestions = {
  notify_now: {
    type: 'noul' as const,
    instructions: 'Does this spending deviation deserve an immediate push notification to the user?',
    criteria: {
      true: 'Anomalous, relevant, and actionable right now',
      false: 'Noise, expected, or better in a digest',
    },
  },
  tone: {
    type: 'choice' as const,
    instructions: 'In what tone should it be communicated?',
    criteria: {
      celebrate: 'Good news (spending down, goal reached)',
      info: 'Neutral, awareness only',
      warn: 'Caution, trend to watch',
      urgent: 'Possible problem: fraud, double charge, blown budget',
    },
  },
  actionability: {
    type: 'score' as const,
    instructions: 'How much can the user do about it by reading the notification?',
    criteria: ['Nothing', 'Little', 'Fairly', 'Clear and immediate action'],
  },
};

export type AnomalyGateVerdict = { notify: boolean; severity: 'info' | 'warning' | 'critical' };

export function routeAnomalyGate(answer: {
  notifyNow?: number;
  tone?: string;
  toneConfidence?: number;
}): AnomalyGateVerdict {
  if ((answer.notifyNow ?? 0) < JEV_ANOMALY.notifyNoul) {
    return { notify: false, severity: 'info' };
  }
  switch (answer.tone) {
    case 'urgent':
      return { notify: true, severity: 'critical' };
    case 'warn':
      return { notify: true, severity: 'warning' };
    case 'celebrate':
    case 'info':
      return { notify: true, severity: 'info' };
    default:
      return { notify: true, severity: 'warning' };
  }
}

export const reportSkipQuestions = {
  actionable: {
    type: 'noul' as const,
    instructions: 'Is there anything actionable for the user in this monthly data (anomaly, drift, goal at risk, win to celebrate)?',
  },
  driver: {
    type: 'choice' as const,
    instructions: 'What single theme should the monthly summary lead with?',
    criteria: {
      spending_shift: 'A spending category moved materially',
      savings_win: 'Savings rate or liquidity improved',
      debt_pressure: 'Debt load or installments need attention',
      quiet_month: 'Nothing moved; a routine month',
    },
  },
};

export function routeReportSkip(actionableNoul: number | undefined): 'generate' | 'template' {
  return (actionableNoul ?? 0) >= JEV_REPORT_SKIP.actionableNoul ? 'generate' : 'template';
}

export const healthDriverQuestions = {
  driver: {
    type: 'choice' as const,
    instructions: 'Which single health component best explains the score change?',
    criteria: {
      savingsRate: 'Income vs outflow moved',
      budgetAdherence: 'Budget overspend or discipline moved',
      debtLoad: 'Debt payments vs income moved',
      liquidityMonths: 'Liquid buffer vs essentials moved',
      subscriptionLoad: 'Subscriptions vs income moved',
    },
  },
};

export const subscriptionSentinelQuestions = {
  status: {
    type: 'choice' as const,
    instructions: 'What is the state of this charge series?',
    criteria: {
      active: 'Regular subscription, stable amount',
      'price-hiked': 'Subscription with a recent price increase',
      zombie: 'Recurring but likely unused or forgotten (micro-amounts, duplicate services)',
      'one-off-cluster': 'Clustered one-off charges, not a subscription',
    },
  },
  regularity: {
    type: 'score' as const,
    instructions: 'How mechanical is the recurrence?',
    criteria: ['Random', 'Vague', 'Regular', 'Clockwork'],
  },
  create_planned: {
    type: 'noul' as const,
    instructions: 'Is it worth creating a monthly planned expense in the plan?',
  },
};
