import { describe, expect, it } from 'vitest';
import { normalizeMetadataFilters } from './metadata-filters';

describe('normalizeMetadataFilters', () => {
  it('returns undefined for empty input', () => {
    expect(normalizeMetadataFilters()).toBeUndefined();
    expect(normalizeMetadataFilters({})).toBeUndefined();
  });

  it('keeps only non-empty filter fields', () => {
    expect(
      normalizeMetadataFilters({
        documentIds: ['a', ''],
        mimeTypes: [],
        tags: ['policy'],
        createdAfter: '2024-01-01',
      }),
    ).toEqual({
      documentIds: ['a'],
      tags: ['policy'],
      createdAfter: '2024-01-01',
    });
  });
});
