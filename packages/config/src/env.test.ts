import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('defaults to mock providers without API keys', () => {
    const env = loadEnv({});
    expect(env.resolvedLlmProvider).toBe('mock');
    expect(env.resolvedEmbeddingProvider).toBe('mock');
  });

  it('uses openai when LLM_API_KEY is set', () => {
    const env = loadEnv({ LLM_API_KEY: 'sk-test' });
    expect(env.resolvedLlmProvider).toBe('openai');
    expect(env.resolvedEmbeddingProvider).toBe('openai');
  });
});
