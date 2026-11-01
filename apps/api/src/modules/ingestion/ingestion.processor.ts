import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import { loadEnv } from '@knowledgepilot/config';
import {
  createDbClient,
  DocumentStatus,
  IngestionJobState,
} from '@knowledgepilot/db';
import {
  chunkFixedSize,
  chunkParentChild,
  chunkStructureAware,
  estimateTokenCount,
  extractTextFromBuffer,
  hashContent,
} from '@knowledgepilot/rag';
import { createEmbedder } from '../../adapters/ai.factory';
import { createBlobStorage } from '../../adapters/storage.factory';
import { insertChunkWithEmbedding } from '../../adapters/prisma-chunk.repository';
import { INGESTION_QUEUE, type IngestionJobPayload } from './ingestion.constants';

@Processor(INGESTION_QUEUE, {
  concurrency: Number(process.env.INGESTION_CONCURRENCY || 2),
})
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);
  private readonly db = createDbClient();
  private readonly env = loadEnv();
  private readonly storage = createBlobStorage(this.env);
  private readonly embedder = createEmbedder(this.env);

  async process(job: Job<IngestionJobPayload>): Promise<void> {
    const { documentId, ingestionJobId, tenantId } = job.data;
    this.logger.log(`ingestion start`, {
      documentId,
      ingestionJobId,
      tenantId,
      bullJobId: job.id,
      attempt: job.attemptsMade + 1,
    });

    try {
      await this.setJobState(ingestionJobId, IngestionJobState.processing, 5);
      await this.db.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.processing, errorMessage: null },
      });

      const document = await this.db.document.findFirst({
        where: { id: documentId, tenantId, deletedAt: null },
      });
      if (!document) {
        throw new Error(`Document ${documentId} not found for tenant ${tenantId}`);
      }

      await this.setJobState(ingestionJobId, IngestionJobState.extracting, 20);
      const buffer = await this.storage.read(document.storageKey);
      const extracted = await extractTextFromBuffer(
        buffer,
        document.mimeType,
        document.originalFilename,
      );
      if (!extracted.text.trim()) {
        throw new Error('No extractable text found in document');
      }

      const textHash = hashContent(extracted.text);
      const binaryHash = createHash('sha256').update(buffer).digest('hex');

      await this.setJobState(ingestionJobId, IngestionJobState.chunking, 40);
      const requestedStrategy =
        document.chunkingStrategy === 'parent_child' ||
        document.chunkingStrategy === 'fixed' ||
        document.chunkingStrategy === 'structure_aware'
          ? document.chunkingStrategy
          : this.env.parentChildEnabled
            ? 'parent_child'
            : document.mimeType.includes('markdown') ||
                document.mimeType.includes('html') ||
                document.originalFilename.match(/\.(md|markdown|html|htm)$/i)
              ? 'structure_aware'
              : 'fixed';

      await this.db.chunk.deleteMany({ where: { documentId, tenantId } });

      let chunkCount = 0;
      let chunkingStrategy = requestedStrategy;

      await this.setJobState(ingestionJobId, IngestionJobState.embedding, 60);

      if (requestedStrategy === 'parent_child') {
        const { parents, children } = chunkParentChild(extracted.text, {
          parentSize: Math.max(this.env.RAG_DEFAULT_CHUNK_SIZE * 2, 1200),
          childSize: this.env.RAG_DEFAULT_CHUNK_SIZE,
          childOverlap: this.env.RAG_DEFAULT_CHUNK_OVERLAP,
        });
        if (parents.length === 0) {
          throw new Error('Chunking produced no chunks');
        }
        const parentEmbeddings = await this.embedder.embed(parents.map((p) => p.content));
        const parentIds: string[] = [];
        await this.setJobState(ingestionJobId, IngestionJobState.indexing, 80);
        for (let i = 0; i < parents.length; i += 1) {
          const parent = parents[i]!;
          const embedding = parentEmbeddings[i]!;
          const id = `chk_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
          parentIds.push(id);
          await insertChunkWithEmbedding(this.db, {
            id,
            tenantId,
            documentId,
            content: parent.content,
            tokenCount: estimateTokenCount(parent.content),
            headingPath: parent.headingPath,
            pageStart: parent.pageStart,
            pageEnd: parent.pageEnd,
            charStart: parent.charStart,
            charEnd: parent.charEnd,
            ordinal: i,
            embedding,
          });
        }
        const childEmbeddings = await this.embedder.embed(children.map((c) => c.content));
        for (let i = 0; i < children.length; i += 1) {
          const child = children[i]!;
          const embedding = childEmbeddings[i]!;
          const parentId = parentIds[child.parentOrdinal ?? 0];
          await insertChunkWithEmbedding(this.db, {
            id: `chk_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
            tenantId,
            documentId,
            parentChunkId: parentId,
            content: child.content,
            tokenCount: estimateTokenCount(child.content),
            headingPath: child.headingPath,
            pageStart: child.pageStart,
            pageEnd: child.pageEnd,
            charStart: child.charStart,
            charEnd: child.charEnd,
            ordinal: parents.length + i,
            embedding,
          });
        }
        chunkCount = parents.length + children.length;
        chunkingStrategy = 'parent_child';
      } else {
        const pieces =
          requestedStrategy === 'structure_aware'
            ? chunkStructureAware(extracted.text, {
                chunkSize: this.env.RAG_DEFAULT_CHUNK_SIZE,
                overlap: this.env.RAG_DEFAULT_CHUNK_OVERLAP,
              })
            : chunkFixedSize(extracted.text, {
                chunkSize: this.env.RAG_DEFAULT_CHUNK_SIZE,
                overlap: this.env.RAG_DEFAULT_CHUNK_OVERLAP,
              });
        if (pieces.length === 0) {
          throw new Error('Chunking produced no chunks');
        }
        const embeddings = await this.embedder.embed(pieces.map((p) => p.content));
        if (embeddings.length !== pieces.length) {
          throw new Error('Embedding count mismatch');
        }
        await this.setJobState(ingestionJobId, IngestionJobState.indexing, 80);
        for (let i = 0; i < pieces.length; i += 1) {
          const piece = pieces[i]!;
          const embedding = embeddings[i]!;
          await insertChunkWithEmbedding(this.db, {
            id: `chk_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
            tenantId,
            documentId,
            content: piece.content,
            tokenCount: estimateTokenCount(piece.content),
            headingPath: piece.headingPath,
            pageStart: piece.pageStart,
            pageEnd: piece.pageEnd,
            charStart: piece.charStart,
            charEnd: piece.charEnd,
            ordinal: i,
            embedding,
          });
        }
        chunkCount = pieces.length;
        chunkingStrategy = requestedStrategy;
      }

      await this.db.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.ready,
          pageCount: extracted.pageCount ?? null,
          embeddingModel: this.embedder.model,
          chunkingStrategy,
          contentHash: binaryHash || textHash,
          metadata: {
            textHash,
            chunkCount,
            embeddingDims: this.embedder.dimensions,
          },
          errorMessage: null,
        },
      });

      await this.db.ingestionJob.update({
        where: { id: ingestionJobId },
        data: {
          state: IngestionJobState.ready,
          progress: 100,
          attempt: job.attemptsMade + 1,
          finishedAt: new Date(),
          lastError: null,
        },
      });

      this.logger.log(`ingestion ready`, { documentId, chunks: chunkCount });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ingestion failed';
      this.logger.error(`ingestion failed`, { documentId, message });
      await this.db.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.failed, errorMessage: message },
      });
      await this.db.ingestionJob.update({
        where: { id: ingestionJobId },
        data: {
          state: IngestionJobState.failed,
          progress: 100,
          attempt: job.attemptsMade + 1,
          lastError: message,
          finishedAt: new Date(),
        },
      });
      throw error;
    }
  }

  private async setJobState(ingestionJobId: string, state: IngestionJobState, progress: number) {
    await this.db.ingestionJob.update({
      where: { id: ingestionJobId },
      data: { state, progress },
    });
  }
}
