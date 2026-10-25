import { formatEvidenceBlocks } from '../prompting/format-evidence';
import { GROUNDED_SYSTEM_PROMPT } from '../prompting/grounded-system-prompt';
import type { ChunkRepository, RetrievedChunk } from '../ports/chunk-repository';
import type { Embedder } from '../ports/embedder';
import type { LlmClient } from '../ports/llm-client';
import { type PipelineConfig } from '../types';
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
    retrievedChunkIds: string[];
    latencyMs: Record<string, number>;
  };
};

export type StreamEvent =
  | { type: 'token'; text: string }
  | { type: 'citation'; citation: AnswerCitation }
  | { type: 'done'; payload: AnswerPayload }
  | { type: 'error'; message: string };

export type RagOrchestrator = {
  answer(input: { tenantId: string; query: string; config?: Partial<PipelineConfig> }): Promise<AnswerPayload>;
  answerStream(input: {
    tenantId: string;
    query: string;
    config?: Partial<PipelineConfig>;
  }): AsyncGenerator<StreamEvent>;
};

export type RagDeps = {
  embedder: Embedder;
  llm: LlmClient;
  chunks: ChunkRepository;
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
    if (!chunk) {
      return [];
    }
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
  retrieved: RetrievedChunk[],
  latencyMs: Record<string, number>,
  abstentionThreshold: number,
): AnswerPayload {
  const retrievedIds = retrieved.map((c) => c.id);
  if (retrieved.length === 0 || (retrieved[0]?.score ?? 0) < abstentionThreshold) {
    return {
      text: 'I could not find enough evidence in your documents to answer that.',
      abstained: true,
      abstentionReason: retrieved.length === 0 ? 'empty_retrieval' : 'low_score',
      citations: [],
      diagnostics: { retrievedChunkIds: retrievedIds, latencyMs },
    };
  }

  if (isAbstentionResponse(rawText)) {
    return {
      text: rawText.replace(/^INSUFFICIENT_EVIDENCE:\s*/i, '').trim() || rawText,
      abstained: true,
      abstentionReason: 'model_abstention',
      citations: [],
      diagnostics: { retrievedChunkIds: retrievedIds, latencyMs },
    };
  }

  const validation = validateCitations(rawText, retrievedIds);
  if (validation.validIds.length === 0) {
    return {
      text: 'I could not produce a grounded answer with valid citations from the retrieved evidence.',
      abstained: true,
      abstentionReason: 'citation_validation_failed',
      citations: [],
      diagnostics: { retrievedChunkIds: retrievedIds, latencyMs },
    };
  }

  return {
    text: rawText.trim(),
    abstained: false,
    citations: buildCitations(validation.validIds, retrieved),
    diagnostics: { retrievedChunkIds: retrievedIds, latencyMs },
  };
}

export function createRagOrchestrator(deps: RagDeps): RagOrchestrator {
  async function retrieve(tenantId: string, query: string, config: PipelineConfig) {
    const latencyMs: Record<string, number> = {};
    const embedStarted = Date.now();
    const [queryEmbedding] = await deps.embedder.embed([query]);
    latencyMs.embed = Date.now() - embedStarted;
    if (!queryEmbedding) {
      throw new Error('Embedder returned no vector for query');
    }

    const retrieveStarted = Date.now();
    const retrieved = await deps.chunks.similaritySearch({
      tenantId,
      embedding: queryEmbedding,
      topK: config.topK,
    });
    latencyMs.retrieve = Date.now() - retrieveStarted;
    return { retrieved, latencyMs };
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
      const { retrieved, latencyMs } = await retrieve(input.tenantId, input.query, config);
      if (retrieved.length === 0 || (retrieved[0]?.score ?? 0) < deps.abstentionThreshold) {
        return finalizeAnswer('', retrieved, latencyMs, deps.abstentionThreshold);
      }

      const genStarted = Date.now();
      const raw = await deps.llm.complete(buildMessages(input.query, retrieved));
      latencyMs.generate = Date.now() - genStarted;
      return finalizeAnswer(raw, retrieved, latencyMs, deps.abstentionThreshold);
    },

    async *answerStream(input) {
      try {
        const config = mergeConfig(deps.defaultConfig, input.config);
        const { retrieved, latencyMs } = await retrieve(input.tenantId, input.query, config);
        if (retrieved.length === 0 || (retrieved[0]?.score ?? 0) < deps.abstentionThreshold) {
          const payload = finalizeAnswer('', retrieved, latencyMs, deps.abstentionThreshold);
          yield { type: 'token', text: payload.text } satisfies StreamEvent;
          yield { type: 'done', payload } satisfies StreamEvent;
          return;
        }

        const genStarted = Date.now();
        let raw = '';
        for await (const token of deps.llm.stream(buildMessages(input.query, retrieved))) {
          raw += token;
          yield { type: 'token', text: token } satisfies StreamEvent;
        }
        latencyMs.generate = Date.now() - genStarted;
        const payload = finalizeAnswer(raw, retrieved, latencyMs, deps.abstentionThreshold);
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
