import type { MembershipRole } from '@knowledgepilot/db';

export type AuthPrincipal = {
  userId: string;
  tenantId: string;
  role: MembershipRole;
  email?: string | null;
  name?: string | null;
  requestId: string;
};

export const AUTH_HEADER_USER = 'x-kp-user-id';
export const AUTH_HEADER_TENANT = 'x-kp-tenant-id';
