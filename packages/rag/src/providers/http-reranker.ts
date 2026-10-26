import type { RetrievedChunk } from '../ports/chunk-repository';
import type { Reranker } from '../ports/reranker';

type HttpRerankerOptions = {
  apiKey: string;
  model: string;
  baseUrl: string;
};

/**
 * Cohere-compatible rerank API (POST /rerank).
 * Falls back callers should use mock when no key is configured.
 */
export function createHttpReranker(options: HttpRerankerOptions): Reranker {
  return {
    model: options.model,
    async rerank({ query, chunks, topN }) {
      if (chunks.length === 0) return [];

      const response = await fetch(`${options.baseUrl.replace(/\/$/, '')}/rerank`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model,
          query,
          documents: chunks.map((c) => c.content),
          top_n: topN,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Rerank provider error (${response.status}): ${body.slice(0, 300)}`);
      }

      const json = (await response.json()) as {
        results?: Array<{ index: number; relevance_score: number }>;
      };

      const reranked: RetrievedChunk[] = [];
      for (const row of json.results ?? []) {
        const chunk = chunks[row.index];
        if (!chunk) continue;
        reranked.push({
          ...chunk,
          score: row.relevance_score,
          scoreKind: 'rerank',
        });
      }
      return reranked;
    },
  };
}
