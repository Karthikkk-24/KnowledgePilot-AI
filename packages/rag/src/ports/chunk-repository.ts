import type { RetrievalStrategy } from '../types';
import type { MetadataFilters } from '../retrieval/metadata-filters';

export type ScoreKind = 'cosine' | 'ts_rank' | 'rrf' | 'rerank';

export type RetrievedChunk = {
  id: string;
  documentId: string;
  content: string;
  headingPath?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  score: number;
  scoreKind?: ScoreKind;
  documentTitle?: string;
  mimeType?: string;
};

export type ChunkSearchInput = {
  tenantId: string;
  query: string;
  embedding?: number[];
  topK: number;
  strategy: RetrievalStrategy;
  filters?: MetadataFilters;
};

export type ChunkRepository = {
  search(input: ChunkSearchInput): Promise<RetrievedChunk[]>;
  /** @deprecated use search({ strategy: 'vector' }) */
  similaritySearch?(input: {
    tenantId: string;
    embedding: number[];
    topK: number;
  }): Promise<RetrievedChunk[]>;
};
