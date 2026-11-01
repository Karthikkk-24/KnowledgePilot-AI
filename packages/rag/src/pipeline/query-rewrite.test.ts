import { describe, expect, it } from 'vitest';
import { createMockLlmClient } from '../providers/mock-llm';
import { expandMultiQueries, heuristicRewrite, rewriteQuery } from './query-rewrite';

describe('query rewrite', () => {
  it('normalizes common shorthand', () => {
    expect(heuristicRewrite("what's ERR 4421")).toContain('ERR-4421');
  });

  it('rewrites via mock llm path', async () => {
    const out = await rewriteQuery(createMockLlmClient(), 'What is ERR-4421?');
    expect(out.toLowerCase()).toContain('err');
  });

  it('expands multi-query variants', async () => {
    const variants = await expandMultiQueries(createMockLlmClient(), 'retention period audit logs');
    expect(variants.length).toBeGreaterThan(1);
  });
});
