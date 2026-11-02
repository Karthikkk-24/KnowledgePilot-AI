import { describe, expect, it } from 'vitest';
import { DEFAULT_API_ORIGIN } from '../constants';
import { resolveApiUrl } from './api-url';

describe('resolveApiUrl', () => {
  it('falls back to shared default origin', () => {
    expect(resolveApiUrl(undefined)).toBe(DEFAULT_API_ORIGIN);
    expect(resolveApiUrl('')).toBe(DEFAULT_API_ORIGIN);
  });

  it('keeps an explicit override', () => {
    expect(resolveApiUrl('https://api.example.com')).toBe('https://api.example.com');
  });
});
