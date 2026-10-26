export type RankedId = {
  id: string;
  rank: number;
};

/**
 * Reciprocal Rank Fusion: score(d) = Σ 1 / (k + rank_i(d))
 * Higher is better. Ranks are 1-based.
 */
export function reciprocalRankFusion(
  rankedLists: string[][],
  options: { k?: number } = {},
): Array<{ id: string; score: number }> {
  const k = options.k ?? 60;
  const scores = new Map<string, number>();

  for (const list of rankedLists) {
    list.forEach((id, index) => {
      const rank = index + 1;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    });
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
