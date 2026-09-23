import type { Id } from '../../convex/_generated/dataModel';

export const deletionPendingKey = 'tracky.deletionPending';
export const deletionStartedKey = 'tracky.deletionStarted';

export type PendingDeletion = {
  userId: string;
  deletionExportId: Id<'dataExports'> | null;
};

export function parsePendingDeletion(raw: string | null, currentUserId: string | undefined): PendingDeletion | null {
  if (!raw || !currentUserId) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const request = value as Record<string, unknown>;
    if (request.userId !== currentUserId ||
      (request.deletionExportId !== null && typeof request.deletionExportId !== 'string')) return null;
    return {
      userId: currentUserId,
      deletionExportId: request.deletionExportId as Id<'dataExports'> | null,
    };
  } catch {
    return null;
  }
}
