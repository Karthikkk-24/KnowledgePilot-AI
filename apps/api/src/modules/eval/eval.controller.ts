import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@knowledgepilot/db';
import type { RetrievalStrategy } from '@knowledgepilot/rag';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { MinRole } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import type { AuthPrincipal } from '../../auth/auth.types';
import { ok } from '../../common/http';
import {
  EvalService,
  type BenchmarkDetail,
  type BenchmarkListItem,
  type EvalRunDetailDto,
  type EvalRunDto,
} from './eval.service';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class EvalController {
  constructor(private readonly evalService: EvalService) {}

  @Get('benchmarks')
  async listBenchmarks(
    @CurrentAuth() auth: AuthPrincipal,
  ): Promise<ReturnType<typeof ok<BenchmarkListItem[]>>> {
    return ok(await this.evalService.listBenchmarks(auth.tenantId));
  }

  @Get('benchmarks/:id')
  async getBenchmark(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id') id: string,
  ): Promise<ReturnType<typeof ok<BenchmarkDetail>>> {
    return ok(await this.evalService.getBenchmark(auth.tenantId, id));
  }

  @Post('benchmarks/seed')
  @MinRole(MembershipRole.admin)
  async seed(@CurrentAuth() auth: AuthPrincipal): Promise<ReturnType<typeof ok<BenchmarkDetail>>> {
    return ok(await this.evalService.seedSmokeBenchmark(auth.tenantId));
  }

  @Get('eval/runs')
  async listRuns(@CurrentAuth() auth: AuthPrincipal): Promise<ReturnType<typeof ok<EvalRunDto[]>>> {
    return ok(await this.evalService.listRuns(auth.tenantId));
  }

  @Get('eval/runs/:id')
  async getRun(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id') id: string,
  ): Promise<ReturnType<typeof ok<EvalRunDetailDto>>> {
    return ok(await this.evalService.getRun(auth.tenantId, id));
  }

  @Post('eval/runs')
  @MinRole(MembershipRole.member)
  async startRun(
    @CurrentAuth() auth: AuthPrincipal,
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
      await this.evalService.startRun(auth.tenantId, {
        benchmarkSetId: body?.benchmarkSetId,
        label: body?.label,
        retrievalStrategy: body?.retrievalStrategy,
        rerankingEnabled: body?.rerankingEnabled,
        topK: body?.topK,
      }),
    );
  }
}
