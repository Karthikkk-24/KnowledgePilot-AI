import type { MembershipRole } from '@knowledgepilot/db';
import { AUTH_HEADERS } from '@knowledgepilot/shared';

export type AuthPrincipal = {
  userId: string;
  tenantId: string;
  role: MembershipRole;
  email?: string | null;
  name?: string | null;
  requestId: string;
};

export const AUTH_HEADER_USER = AUTH_HEADERS.userId;
export const AUTH_HEADER_TENANT = AUTH_HEADERS.tenantId;
