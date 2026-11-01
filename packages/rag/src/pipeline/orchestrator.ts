import { formatEvidenceBlocks } from '../prompting/format-evidence';
import { GROUNDED_SYSTEM_PROMPT } from '../prompting/grounded-system-prompt';
import type { ChunkRepository, RetrievedChunk } from '../ports/chunk-repository';
import type { Embedder } from '../ports/embedder';
import type { LlmClient } from '../ports/llm-client';
import type { Reranker } from '../ports/reranker';
import { normalizeMetadataFilters, type MetadataFilters } from '../retrieval/metadata-filters';
import { reciprocalRankFusion } from '../retrieval/reciprocal-rank-fusion';
import { type PipelineConfig } from '../types';
import { compressEvidence } from './context-compression';
import { shouldAbstainOnRetrieval } from './decide-abstention';
import { expandMultiQueries, rewriteQuery } from './query-rewrite';
import { isAbstentionResponse, validateCitations } from './validate-citations';

export type AnswerCitation = {
  chunkId: string;
  documentId: string;
  page?: number;
  quote: string;
  documentTitle?: string;
};

export type AnswerDiagnostics = {
  retrievalStrategy: PipelineConfig['retrievalStrategy'];
  rerankingEnabled: boolean;
  queryRewriteEnabled: boolean;
  multiQueryEnabled: boolean;
  contextCompressionEnabled: boolean;
  rewrittenQuery?: string;
  multiQueries?: string[];
  retrievedChunkIds: string[];
  rerankedChunkIds?: string[];
  invalidCitationIds?: string[];
  latencyMs: Record<string, number>;
  topScore?: number;
  scoreKind?: string;
};

export type AnswerPayload = {
  text: string;
  abstained: boolean;
  abstentionReason?: string;
  citations: AnswerCitation[];
  diagnostics: AnswerDiagnostics;
};

export type StreamEvent =
  | { type: 'token'; text: string }
  | { type: 'citation'; citation: AnswerCitation }
  | { type: 'diagnostics'; diagnostics: AnswerPayload['diagnostics'] }
  | { type: 'done'; payload: AnswerPayload }
  | { type: 'error'; message: string };

export type AnswerInput = {
  tenantId: string;
  query: string;
  config?: Partial<PipelineConfig>;
  filters?: MetadataFilters;
};

export type RagOrchestrator = {
  answer(input: AnswerInput): Promise<AnswerPayload>;
  answerStream(input: AnswerInput): AsyncGenerator<StreamEvent>;
};

export type RagDeps = {
  embedder: Embedder;
  llm: LlmClient;
  chunks: ChunkRepository;
  reranker?: Reranker;
  defaultConfig: PipelineConfig;
  abstentionThreshold: number;
};

function mergeConfig(base: PipelineConfig, partial?: Partial<PipelineConfig>): PipelineConfig {
  return { ...base, ...partial };
}

function buildCitations(validIds: string[], retrieved: RetrievedChunk[]): AnswerCitation[] {
  const byId = new Map(retrieved.map((c) => [c.id, c]));
  return validIds.flatMap((id) => {
    const chunk = byId.get(id);
    if (!chunk) return [];
    return [
      {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        page: chunk.pageStart ?? undefined,
        quote: chunk.content.slice(0, 280),
        documentTitle: chunk.documentTitle,
      },
    ];
  });
}

function finalizeAnswer(
  rawText: string,
  evidence: RetrievedChunk[],
  latencyMs: Record<string, number>,
  config: PipelineConfig,
  extras: {
    retrievedChunkIds: string[];
    rerankedChunkIds?: string[];
    rewrittenQuery?: string;
    multiQueries?: string[];
    forceAbstain?: { reason: string };
  },
): AnswerPayload {
  const evidenceIds = evidence.map((c) => c.id);
  const baseDiagnostics: AnswerDiagnostics = {
    retrievalStrategy: config.retrievalStrategy,
    rerankingEnabled: config.rerankingEnabled,
    queryRewriteEnabled: config.queryRewriteEnabled,
    multiQueryEnabled: config.multiQueryEnabled,
    contextCompressionEnabled: config.contextCompressionEnabled,
    rewrittenQuery: extras.rewrittenQuery,
    multiQueries: extras.multiQueries,
    retrievedChunkIds: extras.retrievedChunkIds,
    rerankedChunkIds: extras.rerankedChunkIds,
    latencyMs,
    topScore: evidence[0]?.score,
    scoreKind: evidence[0]?.scoreKind,
  };

  if (extras.forceAbstain) {
    return {
      text: 'I could not find enough evidence in your documents to answer that.',
      abstained: true,
      abstentionReason: extras.forceAbstain.reason,
      citations: [],
      diagnostics: baseDiagnostics,
    };
  }

  if (!rawText.trim()) {
    return {
      text: 'I could not find enough evidence in your documents to answer that.',
      abstained: true,
      abstentionReason: 'empty_retrieval',
      citations: [],
      diagnostics: baseDiagnostics,
    };
  }

  if (isAbstentionResponse(rawText)) {
    return {
      text: rawText.replace(/^INSUFFICIENT_EVIDENCE:\s*/i, '').trim() || rawText,
      abstained: true,
      abstentionReason: 'model_abstention',
      citations: [],
      diagnostics: baseDiagnostics,
    };
  }

  const validation = validateCitations(rawText, evidenceIds);
  if (validation.validIds.length === 0) {
    return {
      text: 'I could not produce a grounded answer with valid citations from the retrieved evidence.',
      abstained: true,
      abstentionReason: 'citation_validation_failed',
      citations: [],
      diagnostics: {
        ...baseDiagnostics,
        invalidCitationIds: validation.invalidIds,
      },
    };
  }

  return {
    text: validation.cleanedText,
    abstained: false,
    citations: buildCitations(validation.validIds, evidence),
    diagnostics: {
      ...baseDiagnostics,
      invalidCitationIds: validation.invalidIds.length > 0 ? validation.invalidIds : undefined,
    },
  };
}

export function createRagOrchestrator(deps: RagDeps): RagOrchestrator {
  async function searchOne(
    tenantId: string,
    query: string,
    topK: number,
    strategy: PipelineConfig['retrievalStrategy'],
    filters: MetadataFilters | undefined,
  ): Promise<RetrievedChunk[]> {
    let embedding: number[] | undefined;
    if (strategy === 'vector' || strategy === 'hybrid') {
      const [queryEmbedding] = await deps.embedder.embed([query]);
      if (!queryEmbedding) {
        throw new Error('Embedder returned no vector for query');
      }
      embedding = queryEmbedding;
    }
    return deps.chunks.search({
      tenantId,
      query,
      embedding,
      topK,
      strategy,
      filters,
    });
  }

  async function retrieveAndMaybeRerank(input: AnswerInput, config: PipelineConfig) {
    const latencyMs: Record<string, number> = {};
    const filters = normalizeMetadataFilters(input.filters);
    const candidateCount = config.rerankingEnabled
      ? Math.max(config.topK * config.candidateMultiplier, config.rerankTopN * 2)
      : config.topK;

    let activeQuery = input.query;
    let rewrittenQuery: string | undefined;
    let multiQueries: string[] | undefined;

    if (config.queryRewriteEnabled) {
      const started = Date.now();
      rewrittenQuery = await rewriteQuery(deps.llm, input.query);
      activeQuery = rewrittenQuery;
      latencyMs.rewrite = Date.now() - started;
    }

    if (config.multiQueryEnabled) {
      const started = Date.now();
      multiQueries = await expandMultiQueries(deps.llm, activeQuery);
      latencyMs.multiQuery = Date.now() - started;
    }

    const queries = multiQueries && multiQueries.length > 0 ? multiQueries : [activeQuery];

    const retrieveStarted = Date.now();
    const perQueryHits = await Promise.all(
      queries.map((q) =>
        searchOne(input.tenantId, q, candidateCount, config.retrievalStrategy, filters),
      ),
    );
    latencyMs.retrieve = Date.now() - retrieveStarted;

    let retrieved: RetrievedChunk[];
    if (perQueryHits.length === 1) {
      retrieved = perQueryHits[0] ?? [];
    } else {
      const fused = reciprocalRankFusion(
        perQueryHits.map((hits) => hits.map((h) => h.id)),
        { k: config.rrfK },
      ).slice(0, candidateCount);
      const byId = new Map<string, RetrievedChunk>();
      for (const hits of perQueryHits) {
        for (const hit of hits) {
          if (!byId.has(hit.id)) byId.set(hit.id, hit);
        }
      }
      retrieved = fused.flatMap((row) => {
        const chunk = byId.get(row.id);
        if (!chunk) return [];
        return [{ ...chunk, score: row.score, scoreKind: 'rrf' as const }];
      });
    }

    const retrievedChunkIds = retrieved.map((c) => c.id);
    let rerankedChunkIds: string[] | undefined;

    const abstainCheck = shouldAbstainOnRetrieval(
      retrieved,
      config.retrievalStrategy,
      deps.abstentionThreshold,
    );
    if (abstainCheck.abstain) {
      return {
        evidence: [] as RetrievedChunk[],
        latencyMs,
        retrievedChunkIds,
        rerankedChunkIds,
        rewrittenQuery,
        multiQueries,
        forceAbstain: { reason: abstainCheck.reason ?? 'empty_retrieval' },
      };
    }

    if (config.rerankingEnabled && deps.reranker && retrieved.length > 0) {
      const rerankStarted = Date.now();
      retrieved = await deps.reranker.rerank({
        query: activeQuery,
        chunks: retrieved,
        topN: config.rerankTopN,
      });
      latencyMs.rerank = Date.now() - rerankStarted;
      rerankedChunkIds = retrieved.map((c) => c.id);
    } else {
      retrieved = retrieved.slice(0, config.topK);
    }

    if (config.contextCompressionEnabled) {
      const compressStarted = Date.now();
      retrieved = compressEvidence(retrieved, {
        maxChunks: Math.min(config.topK, config.rerankTopN || config.topK),
        maxCharsPerChunk: 600,
      });
      latencyMs.compress = Date.now() - compressStarted;
    }

    return {
      evidence: retrieved,
      latencyMs,
      retrievedChunkIds,
      rerankedChunkIds,
      rewrittenQuery,
      multiQueries,
    };
  }

  function buildMessages(query: string, retrieved: RetrievedChunk[]) {
    return [
      { role: 'system' as const, content: GROUNDED_SYSTEM_PROMPT },
      {
        role: 'user' as const,
        content: `Evidence:\n${formatEvidenceBlocks(retrieved)}\n\nQuestion: ${query}`,
      },
    ];
  }

  return {
    async answer(input) {
      const config = mergeConfig(deps.defaultConfig, input.config);
      const stage = await retrieveAndMaybeRerank(input, config);
      if (stage.forceAbstain || stage.evidence.length === 0) {
        return finalizeAnswer('', stage.evidence, stage.latencyMs, config, {
          retrievedChunkIds: stage.retrievedChunkIds,
          rerankedChunkIds: stage.rerankedChunkIds,
          rewrittenQuery: stage.rewrittenQuery,
          multiQueries: stage.multiQueries,
          forceAbstain: stage.forceAbstain ?? { reason: 'empty_retrieval' },
        });
      }

      const genStarted = Date.now();
      const raw = await deps.llm.complete(buildMessages(input.query, stage.evidence));
      stage.latencyMs.generate = Date.now() - genStarted;
      return finalizeAnswer(raw, stage.evidence, stage.latencyMs, config, {
        retrievedChunkIds: stage.retrievedChunkIds,
        rerankedChunkIds: stage.rerankedChunkIds,
        rewrittenQuery: stage.rewrittenQuery,
        multiQueries: stage.multiQueries,
      });
    },

    async *answerStream(input) {
      try {
        const config = mergeConfig(deps.defaultConfig, input.config);
        const stage = await retrieveAndMaybeRerank(input, config);

        if (stage.forceAbstain || stage.evidence.length === 0) {
          const payload = finalizeAnswer('', stage.evidence, stage.latencyMs, config, {
            retrievedChunkIds: stage.retrievedChunkIds,
            rerankedChunkIds: stage.rerankedChunkIds,
            rewrittenQuery: stage.rewrittenQuery,
            multiQueries: stage.multiQueries,
            forceAbstain: stage.forceAbstain ?? { reason: 'empty_retrieval' },
          });
          yield { type: 'diagnostics', diagnostics: payload.diagnostics } satisfies StreamEvent;
          yield { type: 'token', text: payload.text } satisfies StreamEvent;
          yield { type: 'done', payload } satisfies StreamEvent;
          return;
        }

        yield {
          type: 'diagnostics',
          diagnostics: {
            retrievalStrategy: config.retrievalStrategy,
            rerankingEnabled: config.rerankingEnabled,
            queryRewriteEnabled: config.queryRewriteEnabled,
            multiQueryEnabled: config.multiQueryEnabled,
            contextCompressionEnabled: config.contextCompressionEnabled,
            rewrittenQuery: stage.rewrittenQuery,
            multiQueries: stage.multiQueries,
            retrievedChunkIds: stage.retrievedChunkIds,
            rerankedChunkIds: stage.rerankedChunkIds,
            latencyMs: stage.latencyMs,
            topScore: stage.evidence[0]?.score,
            scoreKind: stage.evidence[0]?.scoreKind,
          },
        } satisfies StreamEvent;

        const genStarted = Date.now();
        let raw = '';
        for await (const token of deps.llm.stream(buildMessages(input.query, stage.evidence))) {
          raw += token;
          yield { type: 'token', text: token } satisfies StreamEvent;
        }
        stage.latencyMs.generate = Date.now() - genStarted;
        const payload = finalizeAnswer(raw, stage.evidence, stage.latencyMs, config, {
          retrievedChunkIds: stage.retrievedChunkIds,
          rerankedChunkIds: stage.rerankedChunkIds,
          rewrittenQuery: stage.rewrittenQuery,
          multiQueries: stage.multiQueries,
        });
        for (const citation of payload.citations) {
          yield { type: 'citation', citation } satisfies StreamEvent;
        }
        yield { type: 'done', payload } satisfies StreamEvent;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'RAG pipeline failed';
        yield { type: 'error', message } satisfies StreamEvent;
      }
    },
  };
}
