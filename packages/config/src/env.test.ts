import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('defaults to mock providers without API keys', () => {
    const env = loadEnv({});
    expect(env.resolvedLlmProvider).toBe('mock');
    expect(env.resolvedEmbeddingProvider).toBe('mock');
    expect(env.resolvedRerankProvider).toBe('mock');
  });

  it('uses openai when LLM_API_KEY is set', () => {
    const env = loadEnv({ LLM_API_KEY: 'sk-test' });
    expect(env.resolvedLlmProvider).toBe('openai');
    expect(env.resolvedEmbeddingProvider).toBe('openai');
  });

  it('enables hybrid by default and reranking via flag', () => {
    const base = loadEnv({});
    expect(base.hybridSearchEnabled).toBe(true);
    expect(base.rerankingEnabled).toBe(false);
    expect(base.RAG_RETRIEVAL_STRATEGY).toBe('hybrid');

    const withRerank = loadEnv({ FF_RERANKING: 'true' });
    expect(withRerank.rerankingEnabled).toBe(true);

    const hybridOff = loadEnv({ FF_HYBRID_SEARCH: 'false' });
    expect(hybridOff.hybridSearchEnabled).toBe(false);
  });
});
