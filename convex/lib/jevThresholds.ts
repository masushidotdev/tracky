// Versioned jev routing thresholds (Q7). Tune here, never inside domain logic.
// Every gate below pairs a probability with a confidence: labels alone never decide.

export const JEV_THRESHOLDS_VERSION = 1;

export const JEV_TRANSFER = {
  // jev arbitration band for heuristic scores from transferCandidateConfidence().
  arbitrateMin: 0.6,
  arbitrateMax: 0.88,
  autoConfirmActionConfidence: 0.85,
  autoConfirmSameMoney: 0.8,
} as const;

export const JEV_PLANNING_RECONCILE = {
  autoConfirmActionConfidence: 0.85,
  autoConfirmSameMoney: 0.8,
} as const;

export const JEV_IMPORT = {
  autoApplyChoiceConfidence: 0.8,
  autoApplyNoul: 0.7,
  suggestChoiceConfidence: 0.5,
  maxRowsPerBatch: 100,
  maxRowsPerDay: 300,
} as const;

export const JEV_ANOMALY = {
  notifyNoul: 0.6,
} as const;

export const JEV_SUBSCRIPTION = {
  createPlannedNoul: 0.6,
  minCharges: 3,
} as const;

export const JEV_REPORT_SKIP = {
  actionableNoul: 0.5,
} as const;

export const JEV_MEMORY = {
  duplicateNoul: 0.7,
} as const;

// Q5/Q2: daily decision budget per tier; over budget fails closed to determinism.
export const JEV_DAILY_BUDGET = { free: 50, pro: 500 } as const;
