import type { ChunkRepository, RetrievedChunk } from '../ports/chunk-repository';
import type { RetrievalStrategy } from '../types';
import type { MetadataFilters } from '../retrieval/metadata-filters';

export type AgentDocumentSummary = {
  id: string;
  title: string;
  mimeType: string;
  status: string;
};

/**
 * Tenant-bound knowledge access for agent tools.
 * Callers MUST close over tenantId — tools never accept a tenant override.
 */
export type AgentKnowledgeAccess = {
  search(input: {
    query: string;
    topK: number;
    strategy: RetrievalStrategy;
    filters?: MetadataFilters;
    embedding?: number[];
  }): Promise<RetrievedChunk[]>;
  getChunk(chunkId: string): Promise<RetrievedChunk | null>;
  listDocuments(): Promise<AgentDocumentSummary[]>;
};

export function createAgentKnowledgeAccess(input: {
  tenantId: string;
  chunks: ChunkRepository;
  getChunk: (tenantId: string, chunkId: string) => Promise<RetrievedChunk | null>;
  listDocuments: (tenantId: string) => Promise<AgentDocumentSummary[]>;
  embed?: (texts: string[]) => Promise<number[][]>;
}): AgentKnowledgeAccess {
  const { tenantId } = input;
  return {
    async search({ query, topK, strategy, filters }) {
      let embedding: number[] | undefined;
      if ((strategy === 'vector' || strategy === 'hybrid') && input.embed) {
        const [vec] = await input.embed([query]);
        embedding = vec;
      }
      return input.chunks.search({
        tenantId,
        query,
        embedding,
        topK,
        strategy,
        filters,
      });
    },
    getChunk(chunkId) {
      return input.getChunk(tenantId, chunkId);
    },
    listDocuments() {
      return input.listDocuments(tenantId);
    },
  };
}
