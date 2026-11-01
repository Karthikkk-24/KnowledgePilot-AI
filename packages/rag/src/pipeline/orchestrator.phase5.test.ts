import { describe, expect, it } from 'vitest';
import { createMockEmbedder } from '../providers/mock-embedder';
import { createMockLlmClient } from '../providers/mock-llm';
import type { ChunkRepository, RetrievedChunk } from '../ports/chunk-repository';
import { defaultPipelineConfig } from '../types';
import { createRagOrchestrator } from './orchestrator';

function fixtureRepo(hits: RetrievedChunk[]): ChunkRepository {
  return {
    async search() {
      return hits;
    },
    async similaritySearch() {
      return hits;
    },
  };
}

describe('orchestrator phase 5 stages', () => {
  it('records rewrite + multi-query diagnostics when enabled', async () => {
    const rag = createRagOrchestrator({
      embedder: createMockEmbedder(8),
      llm: createMockLlmClient(),
      chunks: fixtureRepo([
        {
          id: 'chunk-1',
          documentId: 'doc-1',
          content: 'ERR-4421 is the escalation code for on-call paging.',
          score: 0.9,
          scoreKind: 'cosine',
        },
      ]),
      defaultConfig: {
        ...defaultPipelineConfig,
        retrievalStrategy: 'vector',
        queryRewriteEnabled: true,
        multiQueryEnabled: true,
        contextCompressionEnabled: true,
      },
      abstentionThreshold: 0.15,
    });

    const result = await rag.answer({
      tenantId: 't1',
      query: 'What is ERR-4421?',
    });

    expect(result.diagnostics.queryRewriteEnabled).toBe(true);
    expect(result.diagnostics.multiQueryEnabled).toBe(true);
    expect(result.diagnostics.contextCompressionEnabled).toBe(true);
    expect(result.diagnostics.rewrittenQuery).toBeTruthy();
    expect(result.diagnostics.multiQueries?.length).toBeGreaterThan(1);
  });
});
