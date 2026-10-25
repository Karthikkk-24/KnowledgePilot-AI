import { randomUUID } from 'node:crypto';
import type { ApiErrorCode } from '@knowledgepilot/shared';

export function createRequestId(): string {
  return randomUUID();
}

export function ok<T>(data: T, requestId = createRequestId()) {
  return {
    data,
    error: null,
    meta: { requestId },
  };
}

export function fail(
  code: ApiErrorCode,
  message: string,
  details: Record<string, unknown> = {},
  requestId = createRequestId(),
) {
  return {
    data: null,
    error: { code, message, details },
    meta: { requestId },
  };
}
