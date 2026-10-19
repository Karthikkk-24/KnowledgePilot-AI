import { describe, expect, it } from 'vitest';
import { defaultPipelineConfig } from './types';

describe('defaultPipelineConfig', () => {
  it('starts with vector retrieval and reranking off', () => {
    expect(defaultPipelineConfig.retrievalStrategy).toBe('vector');
    expect(defaultPipelineConfig.rerankingEnabled).toBe(false);
  });
});
