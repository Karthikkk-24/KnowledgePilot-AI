import type { LlmClient } from '../ports/llm-client';

/**
 * Deterministic rewrite helpers for offline/mock; LLM path for real providers.
 */
export function heuristicRewrite(query: string): string {
  return query
    .replace(/\bwhat's\b/gi, 'what is')
    .replace(/\bwhats\b/gi, 'what is')
    .replace(/\bERR[-\s]?(\d+)\b/gi, 'error code ERR-$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function rewriteQuery(llm: LlmClient, query: string): Promise<string> {
  if (llm.model.startsWith('mock')) {
    return heuristicRewrite(query);
  }

  const raw = await llm.complete([
    {
      role: 'system',
      content:
        'Rewrite the user question for document retrieval. Return only the rewritten question, no preamble.',
    },
    { role: 'user', content: query },
  ]);
  const cleaned = raw.trim().split('\n')[0]?.trim() || query;
  return cleaned.slice(0, 500);
}

export async function expandMultiQueries(llm: LlmClient, query: string): Promise<string[]> {
  if (llm.model.startsWith('mock')) {
    const base = heuristicRewrite(query);
    return [
      base,
      `${base} policy procedure`,
      base
        .split(/\s+/)
        .filter((t) => t.length > 3)
        .slice(0, 4)
        .join(' '),
    ].filter((q, i, arr) => q && arr.indexOf(q) === i);
  }

  const raw = await llm.complete([
    {
      role: 'system',
      content:
        'Generate 3 diverse search queries for the same information need. Return one query per line only.',
    },
    { role: 'user', content: query },
  ]);

  const lines = raw
    .split('\n')
    .map((l) => l.replace(/^\d+[\).\s-]+/, '').trim())
    .filter(Boolean)
    .slice(0, 3);
  return lines.length > 0 ? lines : [query];
}
