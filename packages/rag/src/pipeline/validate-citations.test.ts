import { describe, expect, it } from 'vitest';
import { isAbstentionResponse, stripInvalidCitations, validateCitations } from './validate-citations';

describe('validateCitations', () => {
  it('keeps only retrieved citation ids and strips invalids', () => {
    const result = validateCitations('Answer [chunk:a] and [chunk:b]', ['a']);
    expect(result.validIds).toEqual(['a']);
    expect(result.invalidIds).toEqual(['b']);
    expect(result.cleanedText).not.toContain('[chunk:b]');
    expect(result.cleanedText).toContain('[chunk:a]');
  });
});

describe('stripInvalidCitations', () => {
  it('removes fabricated markers', () => {
    expect(stripInvalidCitations('see [chunk:fake]', ['fake'])).toBe('see');
  });
});

describe('isAbstentionResponse', () => {
  it('detects abstention prefix', () => {
    expect(isAbstentionResponse('INSUFFICIENT_EVIDENCE: missing docs')).toBe(true);
  });
});
