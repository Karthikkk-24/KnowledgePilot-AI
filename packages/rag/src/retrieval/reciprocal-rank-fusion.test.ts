import { describe, expect, it } from 'vitest';
import { reciprocalRankFusion } from './reciprocal-rank-fusion';

describe('reciprocalRankFusion', () => {
  it('promotes items that appear high in multiple lists', () => {
    const fused = reciprocalRankFusion([
      ['a', 'b', 'c'],
      ['b', 'a', 'd'],
    ]);
    expect(fused[0]?.id).toBe('a');
    expect(fused.map((row) => row.id)).toContain('b');
    expect(fused.find((row) => row.id === 'a')!.score).toBeGreaterThan(
      fused.find((row) => row.id === 'c')!.score,
    );
  });

  it('handles a single list', () => {
    const fused = reciprocalRankFusion([['x', 'y']]);
    expect(fused.map((r) => r.id)).toEqual(['x', 'y']);
  });
});
