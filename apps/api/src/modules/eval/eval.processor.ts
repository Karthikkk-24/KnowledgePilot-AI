import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { loadEnv } from '@knowledgepilot/config';
import { createDbClient, EvalRunState } from '@knowledgepilot/db';
import {
  averageMetrics,
  computeItemMetrics,
  createRagOrchestrator,
  defaultPipelineConfig,
  parseCitationIds,
  resolveRelevantChunkIds,
  type ItemMetrics,
  type PipelineConfig,
} from '@knowledgepilot/rag';
import { createEmbedder, createLlmClient, createReranker } from '../../adapters/ai.factory';
import { createPrismaChunkRepository } from '../../adapters/prisma-chunk.repository';
import { EVAL_QUEUE, type EvalJobPayload } from './eval.constants';

@Processor(EVAL_QUEUE)
export class EvalProcessor extends WorkerHost {
  private readonly logger = new Logger(EvalProcessor.name);
  private readonly db = createDbClient();
  private readonly env = loadEnv();
  private readonly chunks = createPrismaChunkRepository(this.db);
  private readonly rag = createRagOrchestrator({
    embedder: createEmbedder(this.env),
    llm: createLlmClient(this.env),
    chunks: this.chunks,
    reranker: createReranker(this.env),
    defaultConfig: defaultPipelineConfig,
    abstentionThreshold: this.env.RAG_ABSTENTION_THRESHOLD,
  });

  async process(job: Job<EvalJobPayload>): Promise<void> {
    const { evalRunId, tenantId } = job.data;
    this.logger.log(`eval start`, { evalRunId, bullJobId: job.id });

    const run = await this.db.evalRun.findFirst({
      where: { id: evalRunId, tenantId },
      include: {
        benchmarkSet: { include: { items: { orderBy: { ordinal: 'asc' } } } },
      },
    });
    if (!run) {
      throw new Error(`Eval run ${evalRunId} not found`);
    }

    const config = {
      ...defaultPipelineConfig,
      ...(run.configSnapshot as Partial<PipelineConfig>),
    } satisfies PipelineConfig;

    await this.db.evalRun.update({
      where: { id: evalRunId },
      data: {
        state: EvalRunState.running,
        startedAt: new Date(),
        errorMessage: null,
        progress: 0,
        completedCount: 0,
      },
    });

    const tenantChunks = await this.db.chunk.findMany({
      where: { tenantId },
      select: { id: true, documentId: true, content: true },
    });

    const itemMetrics: ItemMetrics[] = [];
    let latencyTotal = 0;
    let costTotal = 0;

    try {
      for (let index = 0; index < run.benchmarkSet.items.length; index += 1) {
        const item = run.benchmarkSet.items[index]!;
        const passages = Array.isArray(item.relevantPassages)
          ? (item.relevantPassages as string[])
          : [];
        const relevantIds =
          item.relevantChunkIds.length > 0
            ? item.relevantChunkIds
            : resolveRelevantChunkIds(passages, tenantChunks);

        try {
          const answer = await this.rag.answer({
            tenantId,
            query: item.question,
            config,
          });

          const retrievedIds = answer.diagnostics.retrievedChunkIds;
          const citedIds =
            answer.citations.length > 0
              ? answer.citations.map((c) => c.chunkId)
              : parseCitationIds(answer.text);

          const evidenceTexts = tenantChunks
            .filter((c) => retrievedIds.includes(c.id))
            .map((c) => c.content);

          const promptTokens = Math.ceil(
            (item.question.length + evidenceTexts.join(' ').length) / 4,
          );
          const completionTokens = Math.ceil((answer.text.length || 1) / 4);
          const metrics = computeItemMetrics({
            retrievedIds,
            relevantIds,
            citedIds,
            answer: answer.text,
            evidenceTexts,
            k: config.topK,
            cost: {
              embeddingTokens: Math.ceil(item.question.length / 4),
              promptTokens,
              completionTokens,
              rerankDocuments: answer.diagnostics.rerankingEnabled
                ? retrievedIds.length
                : 0,
            },
          });

          // Abstention questions: success if abstained when no relevant passages.
          if (relevantIds.length === 0) {
            metrics.faithfulness = answer.abstained ? 1 : 0;
            metrics.recallAtK = answer.abstained ? 1 : 0;
            metrics.mrr = answer.abstained ? 1 : 0;
            metrics.ndcgAtK = answer.abstained ? 1 : 0;
          }

          const latencySum = Object.values(answer.diagnostics.latencyMs).reduce(
            (a, b) => a + b,
            0,
          );
          latencyTotal += latencySum;
          costTotal += metrics.estimatedCostUsd;
          itemMetrics.push(metrics);

          await this.db.evalItemResult.upsert({
            where: {
              evalRunId_benchmarkItemId: {
                evalRunId,
                benchmarkItemId: item.id,
              },
            },
            create: {
              evalRunId,
              benchmarkItemId: item.id,
              question: item.question,
              expectedAnswer: item.expectedAnswer,
              retrievedChunkIds: retrievedIds,
              citedChunkIds: citedIds,
              answerText: answer.text,
              abstained: answer.abstained,
              metrics,
              latencyMs: answer.diagnostics.latencyMs,
            },
            update: {
              question: item.question,
              expectedAnswer: item.expectedAnswer,
              retrievedChunkIds: retrievedIds,
              citedChunkIds: citedIds,
              answerText: answer.text,
              abstained: answer.abstained,
              metrics,
              latencyMs: answer.diagnostics.latencyMs,
              errorMessage: null,
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'item failed';
          await this.db.evalItemResult.upsert({
            where: {
              evalRunId_benchmarkItemId: {
                evalRunId,
                benchmarkItemId: item.id,
              },
            },
            create: {
              evalRunId,
              benchmarkItemId: item.id,
              question: item.question,
              expectedAnswer: item.expectedAnswer,
              errorMessage: message,
              metrics: {},
              latencyMs: {},
            },
            update: {
              errorMessage: message,
            },
          });
        }

        const completedCount = index + 1;
        const progress = Math.round((completedCount / run.benchmarkSet.items.length) * 100);
        await this.db.evalRun.update({
          where: { id: evalRunId },
          data: { completedCount, progress },
        });
      }

      const summary = averageMetrics(itemMetrics);
      await this.db.evalRun.update({
        where: { id: evalRunId },
        data: {
          state: EvalRunState.completed,
          progress: 100,
          completedCount: run.benchmarkSet.items.length,
          metricsSummary: summary,
          latencyMsTotal: latencyTotal,
          estimatedCostUsd: costTotal,
          finishedAt: new Date(),
        },
      });
      this.logger.log(`eval completed`, { evalRunId, summary });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Eval run failed';
      await this.db.evalRun.update({
        where: { id: evalRunId },
        data: {
          state: EvalRunState.failed,
          errorMessage: message,
          finishedAt: new Date(),
        },
      });
      throw error;
    }
  }
}
