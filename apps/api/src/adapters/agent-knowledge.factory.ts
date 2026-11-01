import type { DbClient } from '@knowledgepilot/db';
import {
  createAgentKnowledgeAccess,
  type AgentKnowledgeAccess,
  type ChunkRepository,
  type Embedder,
  type RetrievedChunk,
} from '@knowledgepilot/rag';

/**
 * Bind knowledge tools to a single tenant — tools never accept tenantId from the model.
 */
export function createTenantAgentKnowledge(input: {
  db: DbClient;
  tenantId: string;
  chunks: ChunkRepository;
  embedder: Embedder;
}): AgentKnowledgeAccess {
  const { db, tenantId, chunks, embedder } = input;

  return createAgentKnowledgeAccess({
    tenantId,
    chunks,
    embed: (texts) => embedder.embed(texts),
    async getChunk(boundTenantId, chunkId) {
      const row = await db.chunk.findFirst({
        where: {
          id: chunkId,
          tenantId: boundTenantId,
          document: { deletedAt: null },
        },
        include: {
          document: { select: { title: true, mimeType: true } },
        },
      });
      if (!row) return null;
      const mapped: RetrievedChunk = {
        id: row.id,
        documentId: row.documentId,
        content: row.content,
        headingPath: row.headingPath,
        pageStart: row.pageStart,
        pageEnd: row.pageEnd,
        score: 1,
        scoreKind: 'cosine',
        documentTitle: row.document.title,
        mimeType: row.document.mimeType,
      };
      return mapped;
    },
    async listDocuments(boundTenantId) {
      const docs = await db.document.findMany({
        where: { tenantId: boundTenantId, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: { id: true, title: true, mimeType: true, status: true },
      });
      return docs.map((d) => ({
        id: d.id,
        title: d.title,
        mimeType: d.mimeType,
        status: d.status,
      }));
    },
  });
}
