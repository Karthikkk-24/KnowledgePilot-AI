import { createHash } from 'node:crypto';
import type { Embedder } from '../ports/embedder';

function hashToUnitVector(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const token of tokens) {
    const digest = createHash('sha256').update(token).digest();
    for (let i = 0; i < dimensions; i += 1) {
      const byte = digest[i % digest.length] ?? 0;
      vector[i] = (vector[i] ?? 0) + (byte / 255) * (i % 2 === 0 ? 1 : -1);
    }
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

export function createMockEmbedder(dimensions: number): Embedder {
  return {
    model: 'mock-hash-embedder',
    dimensions,
    async embed(texts: string[]) {
      return texts.map((text) => hashToUnitVector(text, dimensions));
    },
  };
}
