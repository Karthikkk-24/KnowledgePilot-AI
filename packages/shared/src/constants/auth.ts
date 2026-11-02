export const AUTH_HEADERS = {
  userId: 'x-kp-user-id',
  tenantId: 'x-kp-tenant-id',
  requestId: 'x-request-id',
  authorization: 'Authorization',
  contentType: 'Content-Type',
} as const;

export const STUB_TENANT_ID = 'tenant_knowledgepilot_default';
export const STUB_TENANT_SLUG = 'default';
export const STUB_USER_ID = 'user_knowledgepilot_stub';
