import type { RetrievedChunk } from '../ports/chunk-repository';
import type { Reranker } from '../ports/reranker';

function termOverlapScore(query: string, content: string): number {
  const qTerms = new Set(query.toLowerCase().split(/\W+/).filter((t) => t.length > 1));
  if (qTerms.size === 0) return 0;
  const cTerms = content.toLowerCase().split(/\W+/).filter(Boolean);
  let hits = 0;
  for (const term of cTerms) {
    if (qTerms.has(term)) hits += 1;
  }
  return hits / qTerms.size;
}

export function createMockReranker(): Reranker {
  return {
    model: 'mock-term-overlap-reranker',
    async rerank({ query, chunks, topN }) {
      return [...chunks]
        .map((chunk) => ({
          ...chunk,
          score: termOverlapScore(query, chunk.content),
          scoreKind: 'rerank' as const,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);
    },
  };
}
