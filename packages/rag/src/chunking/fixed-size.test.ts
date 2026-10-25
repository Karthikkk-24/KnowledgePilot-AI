import { describe, expect, it } from 'vitest';
import { chunkFixedSize } from './fixed-size';

describe('chunkFixedSize', () => {
  it('creates overlapping chunks', () => {
    const text = 'a'.repeat(50);
    const chunks = chunkFixedSize(text, { chunkSize: 20, overlap: 5 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.content.length).toBeLessThanOrEqual(20);
  });
});
