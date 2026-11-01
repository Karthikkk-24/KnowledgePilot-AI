import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { resolveAuthorizedTenantId } from './tenant-access';

describe('resolveAuthorizedTenantId', () => {
  it('defaults to first membership', () => {
    expect(resolveAuthorizedTenantId(['t1', 't2'])).toBe('t1');
  });

  it('allows an explicit tenant the user belongs to', () => {
    expect(resolveAuthorizedTenantId(['t1', 't2'], 't2')).toBe('t2');
  });

  it('rejects cross-tenant requests', () => {
    expect(() => resolveAuthorizedTenantId(['t1'], 't-other')).toThrow(ForbiddenException);
  });

  it('rejects users with no memberships', () => {
    expect(() => resolveAuthorizedTenantId([])).toThrow(ForbiddenException);
  });
});
