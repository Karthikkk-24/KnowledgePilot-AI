import { describe, expect, it } from 'vitest';
import {
  AGENT_DEFAULTS,
  APP_NAME,
  AUTH_HEADERS,
  BENCHMARK_IDS,
  DEFAULT_API_ORIGIN,
  DEFAULT_WEB_ORIGIN,
  QUEUE_NAMES,
  RAG_DEFAULTS,
  UPLOAD_ALLOWED_MIME,
} from './constants';

describe('shared constants', () => {
  it('identifies the product', () => {
    expect(APP_NAME).toBe('KnowledgePilot AI');
  });

  it('groups auth headers', () => {
    expect(AUTH_HEADERS.userId).toBe('x-kp-user-id');
    expect(AUTH_HEADERS.tenantId).toBe('x-kp-tenant-id');
  });

  it('exposes queue and benchmark ids', () => {
    expect(QUEUE_NAMES.ingestion).toBe('ingestion');
    expect(BENCHMARK_IDS.smoke).toBe('bench_smoke_v1');
  });

  it('lists upload mime types', () => {
    expect(UPLOAD_ALLOWED_MIME).toContain('application/pdf');
  });

  it('exposes local-dev origins and RAG/agent tunables', () => {
    expect(DEFAULT_API_ORIGIN).toContain('3001');
    expect(DEFAULT_WEB_ORIGIN).toContain('3000');
    expect(RAG_DEFAULTS.topK).toBeGreaterThan(0);
    expect(AGENT_DEFAULTS.maxSteps).toBeGreaterThan(0);
  });
});
