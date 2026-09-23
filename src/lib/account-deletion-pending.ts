import { isDeletionReason } from './account-deletion-survey';
import type { DeletionFeedback } from './account-deletion-survey';
import type { Id } from '../../convex/_generated/dataModel';

export const deletionPendingKey = 'tracky.deletionPending';
export const deletionStartedKey = 'tracky.deletionStarted';

export type PendingDeletion = {
  userId: string;
  deletionExportId: Id<'dataExports'> | null;
  feedback: DeletionFeedback;
};

export function parsePendingDeletion(raw: string | null, currentUserId: string | undefined): PendingDeletion | null {
  if (!raw || !currentUserId) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const request = value as Record<string, unknown>;
    if (request.userId !== currentUserId ||
      (request.deletionExportId !== null && typeof request.deletionExportId !== 'string')) return null;
    const feedback = request.feedback;
    if (!feedback || typeof feedback !== 'object') return null;
    const survey = feedback as Record<string, unknown>;
    if (!isDeletionReason(survey.reason)) return null;
    const otherText = survey.otherText;
    if (survey.reason === 'other') {
      if (typeof otherText !== 'string' || !otherText.trim() || otherText.trim().length > 500) return null;
    } else if (otherText !== undefined) {
      return null;
    }
    return {
      userId: currentUserId,
      deletionExportId: request.deletionExportId as Id<'dataExports'> | null,
      feedback: survey.reason === 'other'
        ? { reason: 'other', otherText: (otherText as string).trim() }
        : { reason: survey.reason },
    };
  } catch {
    return null;
  }
}
