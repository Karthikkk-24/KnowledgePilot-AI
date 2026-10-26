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
  topK: 8,
  rerankTopN: 5,
  candidateMultiplier: 4,
  queryRewriteEnabled: false,
  multiQueryEnabled: false,
  contextCompressionEnabled: false,
  abstentionThreshold: 0.15,
  rrfK: 60,
};
