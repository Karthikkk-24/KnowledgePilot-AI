import { RAG_DEFAULTS } from '@knowledgepilot/shared';

export type RetrievalStrategy = 'vector' | 'keyword' | 'hybrid';
export type ChunkingStrategy = 'fixed' | 'structure_aware' | 'parent_child';

export type PipelineConfig = {
  retrievalStrategy: RetrievalStrategy;
  chunkingStrategy: ChunkingStrategy;
  rerankingEnabled: boolean;
  topK: number;
  rerankTopN: number;
  candidateMultiplier: number;
  queryRewriteEnabled: boolean;
  multiQueryEnabled: boolean;
  contextCompressionEnabled: boolean;
  abstentionThreshold: number;
  rrfK: number;
};

export const defaultPipelineConfig: PipelineConfig = {
  retrievalStrategy: 'hybrid',
  chunkingStrategy: 'structure_aware',
  rerankingEnabled: false,
  topK: RAG_DEFAULTS.topK,
  rerankTopN: RAG_DEFAULTS.rerankTopN,
  candidateMultiplier: RAG_DEFAULTS.candidateMultiplier,
  queryRewriteEnabled: false,
  multiQueryEnabled: false,
  contextCompressionEnabled: false,
  abstentionThreshold: RAG_DEFAULTS.abstentionThreshold,
  rrfK: RAG_DEFAULTS.rrfK,
};
