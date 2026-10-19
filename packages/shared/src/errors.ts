export const ApiErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL: 'INTERNAL',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export type ApiErrorBody = {
  data: null;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: {
    requestId: string;
  };
};

export type ApiSuccessBody<T> = {
  data: T;
  error: null;
  meta: {
    requestId: string;
  };
};
