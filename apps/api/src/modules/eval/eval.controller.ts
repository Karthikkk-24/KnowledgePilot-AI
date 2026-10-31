import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { RetrievalStrategy } from '@knowledgepilot/rag';
import { ok } from '../../common/http';
import {
  EvalService,
  type BenchmarkDetail,
  type BenchmarkListItem,
  type EvalRunDetailDto,
  type EvalRunDto,
} from './eval.service';

@Controller()
export class EvalController {
  constructor(private readonly evalService: EvalService) {}

  @Get('benchmarks')
  async listBenchmarks(): Promise<ReturnType<typeof ok<BenchmarkListItem[]>>> {
    return ok(await this.evalService.listBenchmarks());
  }

  @Get('benchmarks/:id')
  async getBenchmark(@Param('id') id: string): Promise<ReturnType<typeof ok<BenchmarkDetail>>> {
    return ok(await this.evalService.getBenchmark(id));
  }

  @Post('benchmarks/seed')
  async seed(): Promise<ReturnType<typeof ok<BenchmarkDetail>>> {
    return ok(await this.evalService.seedSmokeBenchmark());
  }

  @Get('eval/runs')
  async listRuns(): Promise<ReturnType<typeof ok<EvalRunDto[]>>> {
    return ok(await this.evalService.listRuns());
  }

  @Get('eval/runs/:id')
  async getRun(@Param('id') id: string): Promise<ReturnType<typeof ok<EvalRunDetailDto>>> {
    return ok(await this.evalService.getRun(id));
  }

  @Post('eval/runs')
  async startRun(
    @Body()
    body: {
      benchmarkSetId?: string;
      label?: string;
      retrievalStrategy?: RetrievalStrategy;
      rerankingEnabled?: boolean;
      topK?: number;
    },
  ): Promise<ReturnType<typeof ok<EvalRunDetailDto>>> {
    return ok(
      await this.evalService.startRun({
        benchmarkSetId: body?.benchmarkSetId,
        label: body?.label,
        retrievalStrategy: body?.retrievalStrategy,
        rerankingEnabled: body?.rerankingEnabled,
        topK: body?.topK,
      }),
    );
  }
}
