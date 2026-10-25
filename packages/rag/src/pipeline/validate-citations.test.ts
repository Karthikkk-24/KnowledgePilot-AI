import { describe, expect, it } from 'vitest';
import { isAbstentionResponse, validateCitations } from './validate-citations';

describe('validateCitations', () => {
  it('keeps only retrieved citation ids', () => {
    const result = validateCitations('Answer [chunk:a] and [chunk:b]', ['a']);
    expect(result.validIds).toEqual(['a']);
    expect(result.invalidIds).toEqual(['b']);
  });
});

describe('isAbstentionResponse', () => {
  it('detects abstention prefix', () => {
    expect(isAbstentionResponse('INSUFFICIENT_EVIDENCE: missing docs')).toBe(true);
  });
});
