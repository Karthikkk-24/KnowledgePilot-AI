export {
  defaultPipelineConfig,
  type ChunkingStrategy,
  type PipelineConfig,
  type RetrievalStrategy,
} from './types';
export {
  createRagOrchestrator,
  type AnswerCitation,
  type AnswerInput,
  type AnswerPayload,
  type RagDeps,
  type RagOrchestrator,
  type StreamEvent,
} from './pipeline/orchestrator';
export {
  parseCitationIds,
  validateCitations,
  stripInvalidCitations,
  isAbstentionResponse,
} from './pipeline/validate-citations';
export { shouldAbstainOnRetrieval } from './pipeline/decide-abstention';
export { chunkFixedSize, type TextChunk } from './chunking/fixed-size';
export { chunkStructureAware } from './chunking/structure-aware';
export { estimateTokenCount } from './chunking/estimate-tokens';
export { extractTextFromBuffer, type ExtractedDocument } from './ingestion/extract-text';
export { hashContent } from './utils/content-hash';
export type { Embedder } from './ports/embedder';
export type { LlmClient, LlmMessage } from './ports/llm-client';
export type {
  ChunkRepository,
  ChunkSearchInput,
  RetrievedChunk,
  ScoreKind,
} from './ports/chunk-repository';
export type { Reranker } from './ports/reranker';
export { createMockEmbedder } from './providers/mock-embedder';
export { createMockLlmClient } from './providers/mock-llm';
export { createMockReranker } from './providers/mock-reranker';
export { createHttpReranker } from './providers/http-reranker';
export { createOpenAIEmbedder } from './providers/openai-embedder';
export { createOpenAILlmClient } from './providers/openai-llm';
export { formatEvidenceBlocks } from './prompting/format-evidence';
export { GROUNDED_SYSTEM_PROMPT } from './prompting/grounded-system-prompt';
export { reciprocalRankFusion } from './retrieval/reciprocal-rank-fusion';
export {
  normalizeMetadataFilters,
  type MetadataFilters,
} from './retrieval/metadata-filters';
export {
  averageMetrics,
  citationCorrectness,
  computeItemMetrics,
  estimateCostUsd,
  faithfulnessHeuristic,
  meanReciprocalRank,
  ndcgAtK,
  recallAtK,
  type CitationCorrectness,
  type CostEstimateInput,
  type ItemMetrics,
} from './evaluation/metrics';
export {
  resolveRelevantChunkIds,
  type PassageChunk,
} from './evaluation/resolve-relevant-chunks';
