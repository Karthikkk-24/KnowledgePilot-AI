import { describe, expect, it } from 'vitest';
import { toPgVectorLiteral } from './vector';
import { STUB_TENANT_ID, STUB_TENANT_SLUG } from './stub-tenant';

describe('vector helpers', () => {
  it('formats pgvector literals', () => {
    expect(toPgVectorLiteral([0.1, 0.2])).toBe('[0.1,0.2]');
  });
});

describe('stub tenant constants', () => {
  it('exposes stable ids', () => {
    expect(STUB_TENANT_SLUG).toBe('default');
    expect(STUB_TENANT_ID.length).toBeGreaterThan(8);
  });
});
