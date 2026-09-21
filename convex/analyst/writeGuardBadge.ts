// Pure write-guard routing (no Convex imports): blast radius in code.
export type WriteGuardBadge = 'safe' | 'confirm' | 'block';

export function routeWriteGuardBadge(answer: {
  risk?: string;
  autoApprove?: number;
  recordCount?: number;
}): WriteGuardBadge {
  // Blast radius in code: multi-record writes are never "safe" on jev's word.
  if (answer.risk === 'high-block') return 'block';
  if ((answer.recordCount ?? 1) > 10) return answer.risk === 'low' ? 'confirm' : 'block';
  if (answer.risk === 'needs-confirmation' || (answer.autoApprove ?? 0) < 0.75) return 'confirm';
  return 'safe';
}
