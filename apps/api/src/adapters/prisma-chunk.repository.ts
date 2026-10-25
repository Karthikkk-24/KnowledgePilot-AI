import {
  type DbClient,
  toPgVectorLiteral,
  type Prisma,
} from '@knowledgepilot/db';
import type { ChunkRepository, RetrievedChunk } from '@knowledgepilot/rag';

type SimilarityRow = {
  id: string;
  document_id: string;
  content: string;
  heading_path: string | null;
  page_start: number | null;
  page_end: number | null;
  score: number;
  document_title: string;
};

export function createPrismaChunkRepository(db: DbClient): ChunkRepository {
  return {
    async similaritySearch(input) {
      const vector = toPgVectorLiteral(input.embedding);
      const rows = await db.$queryRawUnsafe<SimilarityRow[]>(
        `
        SELECT
          c.id,
          c.document_id,
          c.content,
          c.heading_path,
          c.page_start,
          c.page_end,
          d.title AS document_title,
          (1 - (c.embedding <=> $1::vector))::float8 AS score
        FROM chunks c
        INNER JOIN documents d ON d.id = c.document_id
        WHERE c.tenant_id = $2
          AND d.deleted_at IS NULL
          AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> $1::vector
        LIMIT $3
        `,
        vector,
        input.tenantId,
        input.topK,
      );

      return rows.map(
        (row): RetrievedChunk => ({
          id: row.id,
          documentId: row.document_id,
          content: row.content,
          headingPath: row.heading_path,
          pageStart: row.page_start,
          pageEnd: row.page_end,
          score: Number(row.score),
          documentTitle: row.document_title,
        }),
      );
    },
  };
}

export async function insertChunkWithEmbedding(
  db: DbClient,
  data: {
    id: string;
    tenantId: string;
    documentId: string;
    content: string;
    tokenCount: number;
    headingPath?: string;
    pageStart?: number;
    pageEnd?: number;
    charStart: number;
    charEnd: number;
    ordinal: number;
    embedding: number[];
  },
) {
  const chunk = await db.chunk.create({
    data: {
      id: data.id,
      tenantId: data.tenantId,
      documentId: data.documentId,
      content: data.content,
      tokenCount: data.tokenCount,
      headingPath: data.headingPath,
      pageStart: data.pageStart,
      pageEnd: data.pageEnd,
      charStart: data.charStart,
      charEnd: data.charEnd,
      ordinal: data.ordinal,
    },
  });

  await db.$executeRawUnsafe(
    `UPDATE chunks SET embedding = $1::vector WHERE id = $2`,
    toPgVectorLiteral(data.embedding),
    chunk.id,
  );

  return chunk;
}

export type { Prisma };
