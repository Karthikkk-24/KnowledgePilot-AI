import { ForbiddenException } from '@nestjs/common';

/** Pure helper used by guards and isolation tests — never trust client tenant alone. */
export function resolveAuthorizedTenantId(
  membershipTenantIds: string[],
  requestedTenantId?: string,
): string {
  if (membershipTenantIds.length === 0) {
    throw new ForbiddenException('User has no tenant memberships');
  }
  if (requestedTenantId) {
    if (!membershipTenantIds.includes(requestedTenantId)) {
      throw new ForbiddenException('Not a member of requested tenant');
    }
    return requestedTenantId;
  }
  return membershipTenantIds[0]!;
}
