import { describe, expect, it } from 'vitest';
import { createMockEmbedder } from '../providers/mock-embedder';
import { createMockLlmClient } from '../providers/mock-llm';
import { createMockReranker } from '../providers/mock-reranker';
import type { ChunkRepository, RetrievedChunk } from '../ports/chunk-repository';
import { defaultPipelineConfig } from '../types';
import { createRagOrchestrator } from './orchestrator';

function fixtureChunks(): RetrievedChunk[] {
  return [
    {
      id: 'chunk-err',
      documentId: 'doc-1',
      content: 'Incident ERR-4421 requires escalation within 15 minutes.',
      score: 0.41,
      scoreKind: 'cosine',
      documentTitle: 'Ops runbook',
    },
    {
      id: 'chunk-policy',
      documentId: 'doc-2',
      content: 'Retention period is 7 years for financial records.',
      score: 0.55,
      scoreKind: 'cosine',
      documentTitle: 'Policy',
    },
  ];
}

function createFixtureRepo(options?: {
  vectorHits?: RetrievedChunk[];
  keywordHits?: RetrievedChunk[];
}): ChunkRepository {
  const vectorHits = options?.vectorHits ?? fixtureChunks();
  const keywordHits =
    options?.keywordHits ??
    [
      {
        id: 'chunk-err',
        documentId: 'doc-1',
        content: 'Incident ERR-4421 requires escalation within 15 minutes.',
        score: 0.9,
        scoreKind: 'ts_rank' as const,
        documentTitle: 'Ops runbook',
      },
    ];

  return {
    async search(input) {
      if (input.filters?.documentIds?.length) {
        const allowed = new Set(input.filters.documentIds);
        return vectorHits.filter((c) => allowed.has(c.documentId)).slice(0, input.topK);
      }
      if (input.strategy === 'keyword') {
        return keywordHits.slice(0, input.topK);
      }
      if (input.strategy === 'vector') {
        return vectorHits.slice(0, input.topK);
      }
      // hybrid: prefer keyword-ranked exact id first
      return [
        { ...keywordHits[0]!, score: 0.032, scoreKind: 'rrf' as const },
        ...vectorHits.filter((c) => c.id !== keywordHits[0]?.id),
      ].slice(0, input.topK);
    },
  };
}

describe('Phase 2 orchestrator', () => {
  it('abstains when retrieval is empty', async () => {
    const rag = createRagOrchestrator({
      embedder: createMockEmbedder(8),
      llm: createMockLlmClient(),
      chunks: {
        async search() {
          return [];
        },
      },
      defaultConfig: { ...defaultPipelineConfig, retrievalStrategy: 'vector' },
      abstentionThreshold: 0.15,
    });

    const result = await rag.answer({ tenantId: 't1', query: 'zzzz nonsense' });
    expect(result.abstained).toBe(true);
    expect(result.abstentionReason).toBe('empty_retrieval');
    expect(result.citations).toEqual([]);
  });

  it('returns hybrid diagnostics and citations for exact-term style query', async () => {
    const rag = createRagOrchestrator({
      embedder: createMockEmbedder(8),
      llm: createMockLlmClient(),
      chunks: createFixtureRepo(),
      defaultConfig: { ...defaultPipelineConfig, retrievalStrategy: 'hybrid' },
      abstentionThreshold: 0.15,
    });

    const result = await rag.answer({ tenantId: 't1', query: 'What is ERR-4421?' });
    expect(result.abstained).toBe(false);
    expect(result.diagnostics.retrievalStrategy).toBe('hybrid');
    expect(result.diagnostics.retrievedChunkIds[0]).toBe('chunk-err');
    expect(result.citations.some((c) => c.chunkId === 'chunk-err')).toBe(true);
  });

  it('applies document filters before generation', async () => {
    const rag = createRagOrchestrator({
      embedder: createMockEmbedder(8),
      llm: createMockLlmClient(),
      chunks: createFixtureRepo(),
      defaultConfig: { ...defaultPipelineConfig, retrievalStrategy: 'vector' },
      abstentionThreshold: 0.15,
    });

    const result = await rag.answer({
      tenantId: 't1',
      query: 'retention',
      filters: { documentIds: ['doc-2'] },
    });

    expect(result.diagnostics.retrievedChunkIds).toEqual(['chunk-policy']);
  });

  it('reranks and records reranked ids in diagnostics', async () => {
    const rag = createRagOrchestrator({
      embedder: createMockEmbedder(8),
      llm: createMockLlmClient(),
      chunks: createFixtureRepo({
        vectorHits: [
          {
            id: 'chunk-weak',
            documentId: 'doc-1',
            content: 'Unrelated fluff about coffee machines.',
            score: 0.8,
            scoreKind: 'cosine',
          },
          {
            id: 'chunk-strong',
            documentId: 'doc-1',
            content: 'ERR-4421 escalation path for on-call engineers.',
            score: 0.4,
            scoreKind: 'cosine',
          },
        ],
      }),
      reranker: createMockReranker(),
      defaultConfig: {
        ...defaultPipelineConfig,
        retrievalStrategy: 'vector',
        rerankingEnabled: true,
        topK: 2,
        rerankTopN: 1,
      },
      abstentionThreshold: 0.15,
    });

    const result = await rag.answer({
      tenantId: 't1',
      query: 'ERR-4421 escalation',
    });

    expect(result.diagnostics.rerankingEnabled).toBe(true);
    expect(result.diagnostics.rerankedChunkIds?.[0]).toBe('chunk-strong');
  });
});
