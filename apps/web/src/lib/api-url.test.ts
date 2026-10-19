import { describe, expect, it } from 'vitest';

function resolveApiUrl(value: string | undefined) {
  return value ?? 'http://localhost:3001';
}

describe('resolveApiUrl', () => {
  it('falls back to local api', () => {
    expect(resolveApiUrl(undefined)).toBe('http://localhost:3001');
  });
});
