import { AUTH_HEADERS } from './auth';

export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'x-request-id',
  AUTH_HEADERS.userId,
  AUTH_HEADERS.tenantId,
] as const;

export const CORS_EXPOSED_HEADERS = ['x-request-id'] as const;

export const HEALTH_PATHS = {
  live: 'health',
  ready: 'ready',
} as const;
