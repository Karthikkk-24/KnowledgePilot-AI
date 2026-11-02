export const APP_NAME = 'KnowledgePilot AI';
export const APP_VERSION = '0.0.0';

export const API_GLOBAL_PREFIX = 'v1';

/** Local-dev origins; override via env in every deployed environment. */
export const DEFAULT_API_ORIGIN = 'http://localhost:3001';
export const DEFAULT_WEB_ORIGIN = 'http://localhost:3000';

export const WEB_STORAGE_KEYS = {
  userId: 'kp_user_id',
  tenantId: 'kp_tenant_id',
} as const;
