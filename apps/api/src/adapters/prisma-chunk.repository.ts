import { type DbClient, toPgVectorLiteral } from '@knowledgepilot/db';
import type {
  ChunkRepository,
  ChunkSearchInput,
  RetrievedChunk,
  ScoreKind,
} from '@knowledgepilot/rag';
import { reciprocalRankFusion } from '@knowledgepilot/rag';

type SearchRow = {
  id: string;
  document_id: string;
  content: string;
  heading_path: string | null;
  page_start: number | null;
  page_end: number | null;
  score: number;
  document_title: string;
  mime_type: string;
};

function mapRows(rows: SearchRow[], scoreKind: ScoreKind): RetrievedChunk[] {
  return rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    content: row.content,
    headingPath: row.heading_path,
    pageStart: row.page_start,
    pageEnd: row.page_end,
    score: Number(row.score),
    scoreKind,
    documentTitle: row.document_title,
    mimeType: row.mime_type,
  }));
}

function buildFilterSql(
  filters: ChunkSearchInput['filters'],
  startIndex: number,
): { sql: string; params: unknown[]; nextIndex: number } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = startIndex;

  if (filters?.documentIds?.length) {
    clauses.push(`d.id = ANY($${idx}::text[])`);
    params.push(filters.documentIds);
    idx += 1;
  }
  if (filters?.mimeTypes?.length) {
    clauses.push(`d.mime_type = ANY($${idx}::text[])`);
    params.push(filters.mimeTypes);
    idx += 1;
  }
  if (filters?.createdAfter) {
    clauses.push(`d.created_at >= $${idx}::timestamptz`);
    params.push(filters.createdAfter);
    idx += 1;
  }
  if (filters?.createdBefore) {
    clauses.push(`d.created_at <= $${idx}::timestamptz`);
    params.push(filters.createdBefore);
    idx += 1;
  }
  if (filters?.tags?.length) {
    // tags stored as JSON array on documents.metadata.tags
    clauses.push(`COALESCE(d.metadata->'tags', '[]'::jsonb) ?| $${idx}::text[]`);
    params.push(filters.tags);
    idx += 1;
  }

  return {
    sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '',
    params,
    nextIndex: idx,
  };
}

export function createPrismaChunkRepository(db: DbClient): ChunkRepository {
  async function vectorSearch(
    input: ChunkSearchInput & { embedding: number[] },
  ): Promise<RetrievedChunk[]> {
    const filter = buildFilterSql(input.filters, 4);
    const vector = toPgVectorLiteral(input.embedding);
    const rows = await db.$queryRawUnsafe<SearchRow[]>(
      `
      SELECT
        c.id,
        c.document_id,
        c.content,
        c.heading_path,
        c.page_start,
        c.page_end,
        d.title AS document_title,
        d.mime_type,
        (1 - (c.embedding <=> $1::vector))::float8 AS score
      FROM chunks c
      INNER JOIN documents d ON d.id = c.document_id
      WHERE c.tenant_id = $2
        AND d.deleted_at IS NULL
        AND c.embedding IS NOT NULL
        ${filter.sql}
      ORDER BY c.embedding <=> $1::vector
      LIMIT $3
      `,
      vector,
      input.tenantId,
      input.topK,
      ...filter.params,
    );
    return mapRows(rows, 'cosine');
  }

  async function keywordSearch(input: ChunkSearchInput): Promise<RetrievedChunk[]> {
    const query = input.query.trim();
    if (!query) {
      return [];
    }

    const filter = buildFilterSql(input.filters, 4);
    const rows = await db.$queryRawUnsafe<SearchRow[]>(
      `
      SELECT
        c.id,
        c.document_id,
        c.content,
        c.heading_path,
        c.page_start,
        c.page_end,
        d.title AS document_title,
        d.mime_type,
        ts_rank_cd(c.search_vector, websearch_to_tsquery('english', $1))::float8 AS score
      FROM chunks c
      INNER JOIN documents d ON d.id = c.document_id
      WHERE c.tenant_id = $2
        AND d.deleted_at IS NULL
        AND c.search_vector @@ websearch_to_tsquery('english', $1)
        ${filter.sql}
      ORDER BY score DESC
      LIMIT $3
      `,
      query,
      input.tenantId,
      input.topK,
      ...filter.params,
    );
    return mapRows(rows, 'ts_rank');
  }

  return {
    async search(input) {
      if (input.strategy === 'vector') {
        if (!input.embedding) {
          throw new Error('vector strategy requires an embedding');
        }
        return vectorSearch({ ...input, embedding: input.embedding });
      }

      if (input.strategy === 'keyword') {
        return keywordSearch(input);
      }

      // hybrid
      if (!input.embedding) {
        throw new Error('hybrid strategy requires an embedding');
      }
      const pool = Math.max(input.topK * 2, input.topK);
      const [vectorHits, keywordHits] = await Promise.all([
        vectorSearch({ ...input, embedding: input.embedding, topK: pool }),
        keywordSearch({ ...input, topK: pool }),
      ]);

      // One modality only: keep native scores so abstention thresholds still apply.
      if (keywordHits.length === 0) {
        return vectorHits.slice(0, input.topK);
      }
      if (vectorHits.length === 0) {
        return keywordHits.slice(0, input.topK);
      }

      const fused = reciprocalRankFusion(
        [vectorHits.map((h) => h.id), keywordHits.map((h) => h.id)],
        { k: 60 },
      ).slice(0, input.topK);

      const byId = new Map<string, RetrievedChunk>();
      for (const hit of [...vectorHits, ...keywordHits]) {
        if (!byId.has(hit.id)) byId.set(hit.id, hit);
      }

      return fused.flatMap((row) => {
        const chunk = byId.get(row.id);
        if (!chunk) return [];
        return [{ ...chunk, score: row.score, scoreKind: 'rrf' as const }];
      });
    },

    async similaritySearch(input) {
      return vectorSearch({
        tenantId: input.tenantId,
        query: '',
        embedding: input.embedding,
        topK: input.topK,
        strategy: 'vector',
      });
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

  // Trigger fills search_vector; embedding set via raw SQL.
  await db.$executeRawUnsafe(
    `UPDATE chunks SET embedding = $1::vector WHERE id = $2`,
    toPgVectorLiteral(data.embedding),
    chunk.id,
  );

  return chunk;
}
