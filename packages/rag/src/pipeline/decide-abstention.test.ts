import { describe, expect, it } from 'vitest';
import { shouldAbstainOnRetrieval } from './decide-abstention';

describe('shouldAbstainOnRetrieval', () => {
  it('abstains on empty retrieval', () => {
    expect(shouldAbstainOnRetrieval([], 'hybrid', 0.15).abstain).toBe(true);
  });

  it('uses cosine threshold for vector scores', () => {
    expect(
      shouldAbstainOnRetrieval(
        [{ id: '1', documentId: 'd', content: 'x', score: 0.05, scoreKind: 'cosine' }],
        'vector',
        0.15,
      ).reason,
    ).toBe('low_score');
  });

  it('keeps dual-list RRF hits and drops tiny single-list RRF scores', () => {
    expect(
      shouldAbstainOnRetrieval(
        [{ id: '1', documentId: 'd', content: 'ERR-42', score: 0.032, scoreKind: 'rrf' }],
        'hybrid',
        0.15,
      ).abstain,
    ).toBe(false);
    expect(
      shouldAbstainOnRetrieval(
        [{ id: '1', documentId: 'd', content: 'ERR-42', score: 0.016, scoreKind: 'rrf' }],
        'hybrid',
        0.15,
      ).reason,
    ).toBe('low_score');
  });
});

