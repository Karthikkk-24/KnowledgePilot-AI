import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { loadEnv } from '@knowledgepilot/config';
import {
  createDbClient,
  DocumentStatus,
  EvalRunState,
  IngestionJobState,
  } from '@knowledgepilot/db';
import {
  defaultPipelineConfig,
  resolveRelevantChunkIds,
  type PipelineConfig,
  type RetrievalStrategy,
} from '@knowledgepilot/rag';
import { createBlobStorage } from '../../adapters/storage.factory';
import { INGESTION_QUEUE, type IngestionJobPayload } from '../ingestion/ingestion.constants';
import { EVAL_QUEUE, SMOKE_BENCHMARK_ID, type EvalJobPayload } from './eval.constants';
import { loadSmokeBenchmarkFixture } from './eval.fixture';

export type StartEvalInput = {
  benchmarkSetId?: string;
  label?: string;
  retrievalStrategy?: RetrievalStrategy;
  rerankingEnabled?: boolean;
  topK?: number;
};

export type BenchmarkListItem = {
  id: string;
  name: string;
  version: string;
  description: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BenchmarkDetail = {
  id: string;
  name: string;
  version: string;
  description: string | null;
  createdAt: string;
  items: Array<{
    id: string;
    externalId: string;
    question: string;
    expectedAnswer: string | null;
    relevantChunkIds: string[];
    relevantDocumentIds: string[];
    relevantPassages: unknown;
    tags: string[];
    difficulty: string | null;
  }>;
};

export type EvalRunDto = {
  id: string;
  label: string | null;
  state: string;
  progress: number;
  itemCount: number;
  completedCount: number;
  metricsSummary: unknown;
  latencyMsTotal: number | null;
  estimatedCostUsd: number | null;
  errorMessage: string | null;
  configSnapshot: unknown;
  benchmarkSet: { id: string; name: string; version: string };
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type EvalRunDetailDto = EvalRunDto & {
  items: Array<{
    id: string;
    benchmarkItemId: string;
    question: string;
    expectedAnswer: string | null;
    retrievedChunkIds: string[];
    citedChunkIds: string[];
    answerText: string | null;
    abstained: boolean;
    metrics: unknown;
    latencyMs: unknown;
    errorMessage: string | null;
  }>;
};

@Injectable()
export class EvalService {
  private readonly db = createDbClient();
  private readonly env = loadEnv();
  private readonly storage = createBlobStorage(this.env);

  constructor(
    @InjectQueue(EVAL_QUEUE) private readonly evalQueue: Queue,
    @InjectQueue(INGESTION_QUEUE) private readonly ingestionQueue: Queue,
  ) {}

  async listBenchmarks(tenantId: string): Promise<BenchmarkListItem[]> {
    const rows = await this.db.benchmarkSet.findMany({
      where: { tenantId: tenantId },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      version: row.version,
      description: row.description,
      itemCount: row._count.items,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async getBenchmark(tenantId: string, id: string): Promise<BenchmarkDetail> {
    const set = await this.db.benchmarkSet.findFirst({
      where: { id, tenantId: tenantId },
      include: { items: { orderBy: { ordinal: 'asc' } } },
    });
    if (!set) throw new NotFoundException('Benchmark set not found');
    return {
      id: set.id,
      name: set.name,
      version: set.version,
      description: set.description,
      createdAt: set.createdAt.toISOString(),
      items: set.items.map((item) => ({
        id: item.id,
        externalId: item.externalId,
        question: item.question,
        expectedAnswer: item.expectedAnswer,
        relevantChunkIds: item.relevantChunkIds,
        relevantDocumentIds: item.relevantDocumentIds,
        relevantPassages: item.relevantPassages,
        tags: item.tags,
        difficulty: item.difficulty,
      })),
    };
  }

  async seedSmokeBenchmark(tenantId: string): Promise<BenchmarkDetail> {
    const { dir, fixture } = loadSmokeBenchmarkFixture();
    const documentIds: string[] = [];

    for (const docMeta of fixture.documents) {
      const filePath = path.join(dir, docMeta.filename);
      const buffer = readFileSync(filePath);
      const contentHash = createHash('sha256').update(buffer).digest('hex');
      const existing = await this.db.document.findFirst({
        where: { tenantId: tenantId, contentHash, deletedAt: null },
      });

      if (existing) {
        if (existing.status !== DocumentStatus.ready) {
          await this.enqueueIngestion(tenantId, existing.id);
          await this.waitForDocumentReady(tenantId, existing.id);
        }
        documentIds.push(existing.id);
        continue;
      }

      const shortId = randomUUID().replace(/-/g, '').slice(0, 24);
      const storageKey = `${tenantId}/${shortId}/${docMeta.filename}`;
      await this.storage.save({ key: storageKey, body: buffer });
      const document = await this.db.document.create({
        data: {
          id: `doc_${shortId}`,
          tenantId: tenantId,
          title: docMeta.title,
          originalFilename: docMeta.filename,
          mimeType: 'text/markdown',
          storageKey,
          byteSize: buffer.byteLength,
          contentHash,
          status: DocumentStatus.queued,
        },
      });
      await this.enqueueIngestion(tenantId, document.id);
      await this.waitForDocumentReady(tenantId, document.id);
      documentIds.push(document.id);
    }

    const chunks = await this.db.chunk.findMany({
      where: { tenantId: tenantId, documentId: { in: documentIds } },
      select: { id: true, documentId: true, content: true },
    });

    await this.db.benchmarkSet.upsert({
      where: { id: fixture.id },
      create: {
        id: fixture.id,
        tenantId: tenantId,
        name: fixture.name,
        version: fixture.version,
        description: fixture.description,
      },
      update: {
        name: fixture.name,
        version: fixture.version,
        description: fixture.description,
      },
    });

    let ordinal = 0;
    for (const item of fixture.items) {
      const passages = item.relevantPassages ?? [];
      const relevantChunkIds = resolveRelevantChunkIds(passages, chunks);
      const relevantDocumentIds = [
        ...new Set(
          chunks.filter((c) => relevantChunkIds.includes(c.id)).map((c) => c.documentId),
        ),
      ];

      await this.db.benchmarkItem.upsert({
        where: {
          benchmarkSetId_externalId: {
            benchmarkSetId: fixture.id,
            externalId: item.id,
          },
        },
        create: {
          benchmarkSetId: fixture.id,
          externalId: item.id,
          question: item.question,
          expectedAnswer: item.expectedAnswer ?? null,
          relevantPassages: passages,
          relevantChunkIds,
          relevantDocumentIds,
          tags: item.tags ?? [],
          difficulty: item.difficulty,
          ordinal,
        },
        update: {
          question: item.question,
          expectedAnswer: item.expectedAnswer ?? null,
          relevantPassages: passages,
          relevantChunkIds,
          relevantDocumentIds,
          tags: item.tags ?? [],
          difficulty: item.difficulty,
          ordinal,
        },
      });
      ordinal += 1;
    }

    return this.getBenchmark(tenantId, fixture.id);
  }

  async listRuns(tenantId: string): Promise<EvalRunDto[]> {
    const rows = await this.db.evalRun.findMany({
      where: { tenantId: tenantId },
      include: { benchmarkSet: { select: { id: true, name: true, version: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      state: row.state,
      progress: row.progress,
      itemCount: row.itemCount,
      completedCount: row.completedCount,
      metricsSummary: row.metricsSummary,
      latencyMsTotal: row.latencyMsTotal,
      estimatedCostUsd: row.estimatedCostUsd,
      errorMessage: row.errorMessage,
      configSnapshot: row.configSnapshot,
      benchmarkSet: row.benchmarkSet,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getRun(tenantId: string, id: string): Promise<EvalRunDetailDto> {
    const run = await this.db.evalRun.findFirst({
      where: { id, tenantId: tenantId },
      include: {
        benchmarkSet: { select: { id: true, name: true, version: true } },
        itemResults: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!run) throw new NotFoundException('Eval run not found');
    return {
      id: run.id,
      label: run.label,
      state: run.state,
      progress: run.progress,
      itemCount: run.itemCount,
      completedCount: run.completedCount,
      metricsSummary: run.metricsSummary,
      latencyMsTotal: run.latencyMsTotal,
      estimatedCostUsd: run.estimatedCostUsd,
      errorMessage: run.errorMessage,
      configSnapshot: run.configSnapshot,
      benchmarkSet: run.benchmarkSet,
      startedAt: run.startedAt?.toISOString() ?? null,
      finishedAt: run.finishedAt?.toISOString() ?? null,
      createdAt: run.createdAt.toISOString(),
      items: run.itemResults.map((item) => ({
        id: item.id,
        benchmarkItemId: item.benchmarkItemId,
        question: item.question,
        expectedAnswer: item.expectedAnswer,
        retrievedChunkIds: item.retrievedChunkIds,
        citedChunkIds: item.citedChunkIds,
        answerText: item.answerText,
        abstained: item.abstained,
        metrics: item.metrics,
        latencyMs: item.latencyMs,
        errorMessage: item.errorMessage,
      })),
    };
  }

  async startRun(tenantId: string, input: StartEvalInput = {}): Promise<EvalRunDetailDto> {
    const benchmarkSetId = input.benchmarkSetId ?? SMOKE_BENCHMARK_ID;
    let set = await this.db.benchmarkSet.findFirst({
      where: { id: benchmarkSetId, tenantId: tenantId },
      include: { items: true },
    });
    if (!set) {
      await this.seedSmokeBenchmark(tenantId);
      set = await this.db.benchmarkSet.findFirst({
        where: { id: benchmarkSetId, tenantId: tenantId },
        include: { items: true },
      });
    }
    if (!set || set.items.length === 0) {
      throw new BadRequestException('Benchmark set is empty; seed fixtures first');
    }

    let retrievalStrategy = input.retrievalStrategy ?? this.env.RAG_RETRIEVAL_STRATEGY;
    if (!this.env.hybridSearchEnabled && retrievalStrategy === 'hybrid') {
      retrievalStrategy = 'vector';
    }

    const configSnapshot: PipelineConfig = {
      ...defaultPipelineConfig,
      retrievalStrategy,
      rerankingEnabled: input.rerankingEnabled ?? this.env.rerankingEnabled,
      topK: input.topK ?? this.env.RAG_DEFAULT_TOP_K,
      abstentionThreshold: this.env.RAG_ABSTENTION_THRESHOLD,
    };

    const run = await this.db.evalRun.create({
      data: {
        tenantId: tenantId,
        benchmarkSetId: set.id,
        state: EvalRunState.queued,
        label: input.label ?? null,
        configSnapshot,
        itemCount: set.items.length,
        progress: 0,
        completedCount: 0,
      },
    });

    const payload: EvalJobPayload = { tenantId: tenantId, evalRunId: run.id };
    const bullJob = await this.evalQueue.add('run', payload, {
      attempts: 1,
      removeOnComplete: 50,
      removeOnFail: 100,
    });
    await this.db.evalRun.update({
      where: { id: run.id },
      data: { bullJobId: String(bullJob.id) },
    });

    return this.getRun(tenantId, run.id);
  }

  private async enqueueIngestion(tenantId: string, documentId: string) {
    const job = await this.db.ingestionJob.create({
      data: {
        tenantId,
        documentId,
        state: IngestionJobState.queued,
        progress: 0,
      },
    });
    const payload: IngestionJobPayload = {
      tenantId,
      documentId,
      ingestionJobId: job.id,
    };
    const bullJob = await this.ingestionQueue.add('ingest', payload, {
      attempts: this.env.INGESTION_MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: this.env.INGESTION_BACKOFF_MS },
      removeOnComplete: 50,
      removeOnFail: 100,
    });
    await this.db.ingestionJob.update({
      where: { id: job.id },
      data: { bullJobId: String(bullJob.id) },
    });
  }

  private async waitForDocumentReady(tenantId: string, documentId: string, timeoutMs = 60_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const doc = await this.db.document.findFirst({
        where: { id: documentId, tenantId },
      });
      if (!doc) throw new Error(`Document ${documentId} missing during seed`);
      if (doc.status === DocumentStatus.ready) return;
      if (doc.status === DocumentStatus.failed) {
        throw new Error(`Document ${documentId} failed ingestion: ${doc.errorMessage ?? 'unknown'}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Timed out waiting for document ${documentId} to become ready`);
  }
}
