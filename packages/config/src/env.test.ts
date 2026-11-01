import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('defaults to mock providers without API keys', () => {
    const env = loadEnv({});
    expect(env.resolvedLlmProvider).toBe('mock');
    expect(env.resolvedEmbeddingProvider).toBe('mock');
    expect(env.resolvedRerankProvider).toBe('mock');
    expect(env.AUTH_PROVIDER).toBe('stub');
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

  it('defaults advanced stages off and lab on outside production', () => {
    const base = loadEnv({});
    expect(base.queryRewriteEnabled).toBe(false);
    expect(base.multiQueryEnabled).toBe(false);
    expect(base.parentChildEnabled).toBe(false);
    expect(base.experimentLabEnabled).toBe(true);
    expect(base.agenticRagEnabled).toBe(false);
    expect(base.AGENT_MAX_STEPS).toBe(5);

    const labOff = loadEnv({ FF_EXPERIMENT_LAB: 'false' });
    expect(labOff.experimentLabEnabled).toBe(false);

    const advanced = loadEnv({
      FF_QUERY_REWRITE: 'true',
      FF_MULTI_QUERY: '1',
      FF_PARENT_CHILD: 'yes',
      FF_AGENTIC_RAG: 'true',
    });
    expect(advanced.queryRewriteEnabled).toBe(true);
    expect(advanced.multiQueryEnabled).toBe(true);
    expect(advanced.parentChildEnabled).toBe(true);
    expect(advanced.agenticRagEnabled).toBe(true);
  });

  it('rejects stub auth in production', () => {
    expect(() => loadEnv({ APP_NODE_ENV: 'production', AUTH_PROVIDER: 'stub' })).toThrow(
      /stub is not allowed/,
    );
  });

  it('requires Clerk secret when AUTH_PROVIDER=clerk', () => {
    expect(() => loadEnv({ AUTH_PROVIDER: 'clerk' })).toThrow(/CLERK_SECRET_KEY/);
  });
});
