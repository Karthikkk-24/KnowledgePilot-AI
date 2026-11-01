import type { RetrievedChunk } from '../ports/chunk-repository';

/**
 * Cheap deterministic compression: keep top chunks and trim each to a token budget.
 * Used when contextCompressionEnabled is true (no extra LLM cost).
 */
export function compressEvidence(
  chunks: RetrievedChunk[],
  options: { maxChunks: number; maxCharsPerChunk: number } = {
    maxChunks: 5,
    maxCharsPerChunk: 600,
  },
): RetrievedChunk[] {
  return chunks.slice(0, options.maxChunks).map((chunk) => {
    if (chunk.content.length <= options.maxCharsPerChunk) return chunk;
    return {
      ...chunk,
      content: `${chunk.content.slice(0, options.maxCharsPerChunk).trim()}…`,
    };
  });
}
