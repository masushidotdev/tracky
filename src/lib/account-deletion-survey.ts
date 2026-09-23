export const deletionReasons = [
  'too_complex',
  'missing_features',
  'bank_connection',
  'privacy',
  'no_longer_needed',
  'other',
] as const;

export type DeletionReason = (typeof deletionReasons)[number];

export type DeletionFeedback = {
  reason: DeletionReason;
  otherText?: string;
};

export function isDeletionReason(value: unknown): value is DeletionReason {
  return deletionReasons.some((reason) => reason === value);
}
