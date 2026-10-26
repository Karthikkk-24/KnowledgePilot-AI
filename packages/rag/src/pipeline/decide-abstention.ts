import type { RetrievedChunk } from '../ports/chunk-repository';
import type { RetrievalStrategy } from '../types';

export function shouldAbstainOnRetrieval(
  retrieved: RetrievedChunk[],
  strategy: RetrievalStrategy,
  cosineThreshold: number,
): { abstain: boolean; reason?: string } {
  if (retrieved.length === 0) {
    return { abstain: true, reason: 'empty_retrieval' };
  }

  const top = retrieved[0]!;
  const kind = top.scoreKind ?? 'cosine';

  if (kind === 'cosine' || strategy === 'vector') {
    if (top.score < cosineThreshold) {
      return { abstain: true, reason: 'low_score' };
    }
    return { abstain: false };
  }

  if (kind === 'ts_rank' || strategy === 'keyword') {
    if (top.score <= 0) {
      return { abstain: true, reason: 'low_score' };
    }
    return { abstain: false };
  }

  if (kind === 'rrf') {
    // Rank-1 from a single list scores 1/(k+1) with default k=60 (~0.0164).
    // Require a higher fused score so pure one-sided weak matches can still fall through
    // to cosine/keyword paths (repository returns those when the other list is empty).
    const minDualListHint = 1 / (60 + 1) + 1e-6;
    if (top.score < minDualListHint) {
      return { abstain: true, reason: 'low_score' };
    }
    return { abstain: false };
  }

  // Rerank: non-empty is enough; model + citation validation handle weak grounding.
  return { abstain: false };
}
