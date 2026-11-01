import { describe, expect, it } from 'vitest';
import { compressEvidence } from './context-compression';

describe('compressEvidence', () => {
  it('trims chunk count and length', () => {
    const chunks = Array.from({ length: 8 }, (_, i) => ({
      id: `c${i}`,
      documentId: 'd',
      content: 'x'.repeat(1000),
      score: 1,
    }));
    const out = compressEvidence(chunks, { maxChunks: 3, maxCharsPerChunk: 50 });
    expect(out).toHaveLength(3);
    expect(out[0]!.content.length).toBeLessThanOrEqual(51);
  });
});
