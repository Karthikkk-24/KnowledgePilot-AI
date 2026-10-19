export type RetrievalStrategy = 'vector' | 'keyword' | 'hybrid';
export type ChunkingStrategy = 'fixed' | 'structure_aware' | 'parent_child';

export type PipelineConfig = {
  retrievalStrategy: RetrievalStrategy;
  chunkingStrategy: ChunkingStrategy;
  rerankingEnabled: boolean;
  topK: number;
  rerankTopN: number;
  queryRewriteEnabled: boolean;
  multiQueryEnabled: boolean;
  contextCompressionEnabled: boolean;
  abstentionThreshold: number;
};

export const defaultPipelineConfig: PipelineConfig = {
  retrievalStrategy: 'vector',
  chunkingStrategy: 'fixed',
  rerankingEnabled: false,
  topK: 8,
  rerankTopN: 5,
  queryRewriteEnabled: false,
  multiQueryEnabled: false,
  contextCompressionEnabled: false,
  abstentionThreshold: 0.25,
};
