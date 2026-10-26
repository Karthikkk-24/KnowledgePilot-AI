import { formatEvidenceBlocks } from '../prompting/format-evidence';
import { GROUNDED_SYSTEM_PROMPT } from '../prompting/grounded-system-prompt';
import type { ChunkRepository, RetrievedChunk } from '../ports/chunk-repository';
import type { Embedder } from '../ports/embedder';
import type { LlmClient } from '../ports/llm-client';
import type { Reranker } from '../ports/reranker';
import { normalizeMetadataFilters, type MetadataFilters } from '../retrieval/metadata-filters';
import { type PipelineConfig } from '../types';
import { shouldAbstainOnRetrieval } from './decide-abstention';
import { isAbstentionResponse, validateCitations } from './validate-citations';

export type AnswerCitation = {
  chunkId: string;
  documentId: string;
  page?: number;
  quote: string;
  documentTitle?: string;
};

export type AnswerPayload = {
  text: string;
  abstained: boolean;
  abstentionReason?: string;
  citations: AnswerCitation[];
  diagnostics: {
    retrievalStrategy: PipelineConfig['retrievalStrategy'];
    rerankingEnabled: boolean;
    retrievedChunkIds: string[];
    rerankedChunkIds?: string[];
    invalidCitationIds?: string[];
    latencyMs: Record<string, number>;
    topScore?: number;
    scoreKind?: string;
  };
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
    forceAbstain?: { reason: string };
  },
): AnswerPayload {
  const evidenceIds = evidence.map((c) => c.id);
  const baseDiagnostics = {
    retrievalStrategy: config.retrievalStrategy,
    rerankingEnabled: config.rerankingEnabled,
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
  async function retrieveAndMaybeRerank(input: AnswerInput, config: PipelineConfig) {
    const latencyMs: Record<string, number> = {};
    const filters = normalizeMetadataFilters(input.filters);
    const candidateCount = config.rerankingEnabled
      ? Math.max(config.topK * config.candidateMultiplier, config.rerankTopN * 2)
      : config.topK;

    let embedding: number[] | undefined;
    if (config.retrievalStrategy === 'vector' || config.retrievalStrategy === 'hybrid') {
      const embedStarted = Date.now();
      const [queryEmbedding] = await deps.embedder.embed([input.query]);
      latencyMs.embed = Date.now() - embedStarted;
      if (!queryEmbedding) {
        throw new Error('Embedder returned no vector for query');
      }
      embedding = queryEmbedding;
    }

    const retrieveStarted = Date.now();
    let retrieved = await deps.chunks.search({
      tenantId: input.tenantId,
      query: input.query,
      embedding,
      topK: candidateCount,
      strategy: config.retrievalStrategy,
      filters,
    });
    latencyMs.retrieve = Date.now() - retrieveStarted;

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
        forceAbstain: { reason: abstainCheck.reason ?? 'empty_retrieval' },
      };
    }

    if (config.rerankingEnabled && deps.reranker && retrieved.length > 0) {
      const rerankStarted = Date.now();
      retrieved = await deps.reranker.rerank({
        query: input.query,
        chunks: retrieved,
        topN: config.rerankTopN,
      });
      latencyMs.rerank = Date.now() - rerankStarted;
      rerankedChunkIds = retrieved.map((c) => c.id);
    } else {
      retrieved = retrieved.slice(0, config.topK);
    }

    return { evidence: retrieved, latencyMs, retrievedChunkIds, rerankedChunkIds };
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
          forceAbstain: stage.forceAbstain ?? { reason: 'empty_retrieval' },
        });
      }

      const genStarted = Date.now();
      const raw = await deps.llm.complete(buildMessages(input.query, stage.evidence));
      stage.latencyMs.generate = Date.now() - genStarted;
      return finalizeAnswer(raw, stage.evidence, stage.latencyMs, config, {
        retrievedChunkIds: stage.retrievedChunkIds,
        rerankedChunkIds: stage.rerankedChunkIds,
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
