import { describe, expect, it } from 'vitest';
import { APP_NAME } from './constants';

describe('APP_NAME', () => {
  it('identifies the product', () => {
    expect(APP_NAME).toBe('KnowledgePilot AI');
  });
});
