import { describe, expect, it } from 'vitest';
import { chunkParentChild } from './parent-child';

describe('chunkParentChild', () => {
  it('emits parents and children with parent ordinals', () => {
    const text = `# One\n\n${'alpha '.repeat(80)}\n\n# Two\n\n${'beta '.repeat(80)}`;
    const { parents, children } = chunkParentChild(text, {
      parentSize: 400,
      childSize: 120,
      childOverlap: 20,
    });
    expect(parents.length).toBeGreaterThan(0);
    expect(children.length).toBeGreaterThan(parents.length);
    expect(children.every((c) => typeof c.parentOrdinal === 'number')).toBe(true);
  });
});
