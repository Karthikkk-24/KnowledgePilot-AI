import type { RetrievedChunk } from './chunk-repository';

export type Reranker = {
  model: string;
  rerank(input: {
    query: string;
    chunks: RetrievedChunk[];
    topN: number;
  }): Promise<RetrievedChunk[]>;
};
