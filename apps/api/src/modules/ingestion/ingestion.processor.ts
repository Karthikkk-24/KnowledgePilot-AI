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
  chunkStructureAware,
  estimateTokenCount,
  extractTextFromBuffer,
  hashContent,
} from '@knowledgepilot/rag';
import { createEmbedder } from '../../adapters/ai.factory';
import { createLocalBlobStorage } from '../../adapters/local-storage';
import { insertChunkWithEmbedding } from '../../adapters/prisma-chunk.repository';
import { INGESTION_QUEUE, type IngestionJobPayload } from './ingestion.constants';

@Processor(INGESTION_QUEUE)
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);
  private readonly db = createDbClient();
  private readonly env = loadEnv();
  private readonly storage = createLocalBlobStorage(this.env.STORAGE_LOCAL_PATH);
  private readonly embedder = createEmbedder(this.env);

  async process(job: Job<IngestionJobPayload>): Promise<void> {
    const { documentId, ingestionJobId, tenantId } = job.data;
    this.logger.log(`ingestion start`, { documentId, ingestionJobId, bullJobId: job.id });

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
      const useStructure =
        document.mimeType.includes('markdown') ||
        document.mimeType.includes('html') ||
        document.originalFilename.match(/\.(md|markdown|html|htm)$/i);
      const pieces = useStructure
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

      await this.db.chunk.deleteMany({ where: { documentId, tenantId } });

      await this.setJobState(ingestionJobId, IngestionJobState.embedding, 60);
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

      await this.db.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.ready,
          pageCount: extracted.pageCount ?? null,
          embeddingModel: this.embedder.model,
          chunkingStrategy: useStructure ? 'structure_aware' : 'fixed',
          contentHash: binaryHash || textHash,
          metadata: {
            textHash,
            chunkCount: pieces.length,
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

      this.logger.log(`ingestion ready`, { documentId, chunks: pieces.length });
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
