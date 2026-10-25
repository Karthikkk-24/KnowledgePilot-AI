import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  createDbClient,
  DocumentStatus,
  IngestionJobState,
  STUB_TENANT_ID,
} from '@knowledgepilot/db';
import { loadEnv } from '@knowledgepilot/config';
import { createLocalBlobStorage } from '../../adapters/local-storage';
import { INGESTION_QUEUE, type IngestionJobPayload } from '../ingestion/ingestion.constants';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/html',
  'application/octet-stream',
]);

const ALLOWED_EXT = ['.pdf', '.txt', '.md', '.markdown', '.html', '.htm'];

export type DocumentDto = {
  id: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  status: DocumentStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class DocumentsService {
  private readonly db = createDbClient();
  private readonly env = loadEnv();
  private readonly storage = createLocalBlobStorage(this.env.STORAGE_LOCAL_PATH);

  constructor(@InjectQueue(INGESTION_QUEUE) private readonly ingestionQueue: Queue) {}

  private resolveMime(mimeType: string, filename: string) {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown';
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
    if (lower.endsWith('.txt')) return 'text/plain';
    return mimeType || 'application/octet-stream';
  }

  private assertAllowed(filename: string, mimeType: string, size: number) {
    if (size <= 0 || size > this.env.UPLOAD_MAX_BYTES) {
      throw new BadRequestException(
        `File size must be between 1 byte and ${this.env.UPLOAD_MAX_BYTES} bytes`,
      );
    }
    const lower = filename.toLowerCase();
    const extOk = ALLOWED_EXT.some((ext) => lower.endsWith(ext));
    const mimeOk = ALLOWED_MIME.has(mimeType);
    if (!extOk && !mimeOk) {
      throw new BadRequestException('Unsupported file type. Allowed: PDF, Markdown, TXT, HTML');
    }
  }

  async list(): Promise<DocumentDto[]> {
    const docs = await this.db.document.findMany({
      where: { tenantId: STUB_TENANT_ID, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return docs.map((doc) => this.toDto(doc));
  }

  async get(id: string): Promise<
    DocumentDto & {
      latestJob: {
        id: string;
        state: string;
        progress: number;
        lastError: string | null;
      } | null;
    }
  > {
    const doc = await this.db.document.findFirst({
      where: { id, tenantId: STUB_TENANT_ID, deletedAt: null },
      include: {
        ingestionJobs: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    return {
      ...this.toDto(doc),
      latestJob: doc.ingestionJobs[0]
        ? {
            id: doc.ingestionJobs[0].id,
            state: doc.ingestionJobs[0].state,
            progress: doc.ingestionJobs[0].progress,
            lastError: doc.ingestionJobs[0].lastError,
          }
        : null,
    };
  }

  async upload(file: Express.Multer.File): Promise<DocumentDto & { deduplicated: boolean }> {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    const mimeType = this.resolveMime(file.mimetype, file.originalname);
    this.assertAllowed(file.originalname, mimeType, file.size);

    const contentHash = createHash('sha256').update(file.buffer).digest('hex');
    const existing = await this.db.document.findFirst({
      where: { tenantId: STUB_TENANT_ID, contentHash, deletedAt: null },
    });
    if (existing) {
      return { ...this.toDto(existing), deduplicated: true };
    }

    const documentId = randomUUID().replace(/-/g, '').slice(0, 24);
    const storageKey = `${STUB_TENANT_ID}/${documentId}/${file.originalname}`;
    await this.storage.save({ key: storageKey, body: file.buffer });

    const title = file.originalname.replace(/\.[^.]+$/, '') || file.originalname;
    const document = await this.db.document.create({
      data: {
        id: `doc_${documentId}`,
        tenantId: STUB_TENANT_ID,
        title,
        originalFilename: file.originalname,
        mimeType,
        storageKey,
        byteSize: file.size,
        contentHash,
        status: DocumentStatus.queued,
      },
    });

    await this.enqueueIngestion(document.id);
    return { ...this.toDto(document), deduplicated: false };
  }

  async softDelete(id: string) {
    const doc = await this.db.document.findFirst({
      where: { id, tenantId: STUB_TENANT_ID, deletedAt: null },
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    await this.db.document.update({
      where: { id },
      data: { deletedAt: new Date(), status: DocumentStatus.failed, errorMessage: 'Deleted by user' },
    });
    return { id, deleted: true };
  }

  async retryIngestion(id: string): Promise<
    DocumentDto & {
      latestJob: {
        id: string;
        state: string;
        progress: number;
        lastError: string | null;
      } | null;
    }
  > {
    const doc = await this.db.document.findFirst({
      where: { id, tenantId: STUB_TENANT_ID, deletedAt: null },
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    await this.db.document.update({
      where: { id },
      data: { status: DocumentStatus.queued, errorMessage: null },
    });
    await this.enqueueIngestion(id);
    return this.get(id);
  }

  private async enqueueIngestion(documentId: string) {
    const job = await this.db.ingestionJob.create({
      data: {
        tenantId: STUB_TENANT_ID,
        documentId,
        state: IngestionJobState.queued,
        progress: 0,
      },
    });

    const payload: IngestionJobPayload = {
      tenantId: STUB_TENANT_ID,
      documentId,
      ingestionJobId: job.id,
    };

    const bullJob = await this.ingestionQueue.add('ingest', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 50,
      removeOnFail: 100,
    });

    await this.db.ingestionJob.update({
      where: { id: job.id },
      data: { bullJobId: String(bullJob.id) },
    });
  }

  private toDto(doc: {
    id: string;
    title: string;
    originalFilename: string;
    mimeType: string;
    byteSize: number;
    status: DocumentStatus;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: doc.id,
      title: doc.title,
      originalFilename: doc.originalFilename,
      mimeType: doc.mimeType,
      byteSize: doc.byteSize,
      status: doc.status,
      errorMessage: doc.errorMessage,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }
}
