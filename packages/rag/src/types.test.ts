import { describe, expect, it } from 'vitest';
import { defaultPipelineConfig } from './types';

describe('defaultPipelineConfig', () => {
  it('defaults to hybrid retrieval with reranking off', () => {
    expect(defaultPipelineConfig.retrievalStrategy).toBe('hybrid');
    expect(defaultPipelineConfig.rerankingEnabled).toBe(false);
  });
});
