import { describe, expect, it } from 'vitest';
import { resolveRelevantChunkIds } from './resolve-relevant-chunks';

describe('resolveRelevantChunkIds', () => {
  it('matches passages case-insensitively', () => {
    const ids = resolveRelevantChunkIds(['ERR-4421 requires escalation'], [
      { id: 'c1', documentId: 'd1', content: 'Incident ERR-4421 requires escalation within 15 minutes.' },
      { id: 'c2', documentId: 'd2', content: 'Unrelated fluff' },
    ]);
    expect(ids).toEqual(['c1']);
  });
});
