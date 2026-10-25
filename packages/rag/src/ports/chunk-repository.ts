export type RetrievedChunk = {
  id: string;
  documentId: string;
  content: string;
  headingPath?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  score: number;
  documentTitle?: string;
};

export type ChunkRepository = {
  similaritySearch(input: {
    tenantId: string;
    embedding: number[];
    topK: number;
  }): Promise<RetrievedChunk[]>;
};
