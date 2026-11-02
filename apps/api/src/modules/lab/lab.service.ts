import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { loadEnv } from '@knowledgepilot/config';
import { createDbClient, Prisma } from '@knowledgepilot/db';
import {
  defaultPipelineConfig,
  mergePipelineConfig,
  parsePipelineConfig,
  presetLabConfigs,
  summarizePipelineConfig,
  type PipelineConfig,
} from '@knowledgepilot/rag';
import { EvalService, type EvalRunDetailDto, type EvalRunDto } from '../eval/eval.service';

export type ExperimentConfigDto = {
  id: string;
  name: string;
  description: string | null;
  config: PipelineConfig;
  summary: string;
  createdAt: string;
  updatedAt: string;
};

export type LabCompareRow = {
  runId: string;
  label: string | null;
  experimentConfigId: string | null;
  state: string;
  configSummary: string;
  configSnapshot: PipelineConfig;
  metricsSummary: Record<string, number> | null;
  latencyMsTotal: number | null;
  estimatedCostUsd: number | null;
  itemCount: number;
  completedCount: number;
};

export type LabStatusDto = {
  enabled: boolean;
  flags: {
    queryRewrite: boolean;
    multiQuery: boolean;
    parentChild: boolean;
    reranking: boolean;
    hybridSearch: boolean;
  };
  documentChunking: Array<{ strategy: string; count: number }>;
};

@Injectable()
export class LabService {
  private readonly db = createDbClient();
  private readonly env = loadEnv();

  constructor(private readonly evalService: EvalService) {}

  assertEnabled() {
    if (!this.env.experimentLabEnabled) {
      throw new ForbiddenException('Experiment lab is disabled (FF_EXPERIMENT_LAB)');
    }
  }

  status(): LabStatusDto {
    return {
      enabled: this.env.experimentLabEnabled,
      flags: {
        queryRewrite: this.env.queryRewriteEnabled,
        multiQuery: this.env.multiQueryEnabled,
        parentChild: this.env.parentChildEnabled,
        reranking: this.env.rerankingEnabled,
        hybridSearch: this.env.hybridSearchEnabled,
      },
      documentChunking: [],
    };
  }

  async getStatus(tenantId: string): Promise<LabStatusDto> {
    const groups = await this.db.document.groupBy({
      by: ['chunkingStrategy'],
      where: { tenantId, deletedAt: null },
      _count: { _all: true },
    });
    return {
      ...this.status(),
      documentChunking: groups.map((g) => ({
        strategy: g.chunkingStrategy,
        count: g._count._all,
      })),
    };
  }

  private toDto(row: {
    id: string;
    name: string;
    description: string | null;
    config: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }): ExperimentConfigDto {
    const config = parsePipelineConfig(row.config);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      config,
      summary: summarizePipelineConfig(config),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listConfigs(tenantId: string): Promise<ExperimentConfigDto[]> {
    this.assertEnabled();
    const rows = await this.db.experimentConfig.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async getConfig(tenantId: string, id: string): Promise<ExperimentConfigDto> {
    this.assertEnabled();
    const row = await this.db.experimentConfig.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Experiment config not found');
    return this.toDto(row);
  }

  async createConfig(
    tenantId: string,
    input: { name: string; description?: string; config: unknown },
  ): Promise<ExperimentConfigDto> {
    this.assertEnabled();
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    const config = parsePipelineConfig(input.config);
    try {
      const row = await this.db.experimentConfig.create({
        data: {
          tenantId,
          name,
          description: input.description?.trim() || null,
          config,
        },
      });
      return this.toDto(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(`Config name already exists: ${name}`);
      }
      throw error;
    }
  }

  async updateConfig(
    tenantId: string,
    id: string,
    input: { name?: string; description?: string | null; config?: unknown },
  ): Promise<ExperimentConfigDto> {
    this.assertEnabled();
    const existing = await this.db.experimentConfig.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Experiment config not found');

    const data: Prisma.ExperimentConfigUpdateInput = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('Name is required');
      data.name = name;
    }
    if (input.description !== undefined) {
      data.description = input.description?.trim() || null;
    }
    if (input.config !== undefined) {
      data.config = parsePipelineConfig(input.config);
    }

    try {
      const row = await this.db.experimentConfig.update({
        where: { id },
        data,
      });
      return this.toDto(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('Config name already exists');
      }
      throw error;
    }
  }

  async deleteConfig(tenantId: string, id: string): Promise<{ id: string }> {
    this.assertEnabled();
    const existing = await this.db.experimentConfig.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Experiment config not found');
    await this.db.experimentConfig.delete({ where: { id } });
    return { id };
  }

  async seedPresets(tenantId: string): Promise<ExperimentConfigDto[]> {
    this.assertEnabled();
    const out: ExperimentConfigDto[] = [];
    for (const preset of presetLabConfigs) {
      const existing = await this.db.experimentConfig.findFirst({
        where: { tenantId, name: preset.name },
      });
      if (existing) {
        out.push(this.toDto(existing));
        continue;
      }
      const row = await this.db.experimentConfig.create({
        data: {
          tenantId,
          name: preset.name,
          description: preset.description,
          config: preset.config,
        },
      });
      out.push(this.toDto(row));
    }
    return out;
  }

  async runConfig(
    tenantId: string,
    experimentConfigId: string,
    input: { benchmarkSetId?: string; label?: string } = {},
  ): Promise<EvalRunDetailDto> {
    this.assertEnabled();
    const configRow = await this.db.experimentConfig.findFirst({
      where: { id: experimentConfigId, tenantId },
    });
    if (!configRow) throw new NotFoundException('Experiment config not found');
    const config = parsePipelineConfig(configRow.config);

    return this.evalService.startRun(tenantId, {
      benchmarkSetId: input.benchmarkSetId,
      label: input.label ?? configRow.name,
      experimentConfigId: configRow.id,
      config,
    });
  }

  async compareRuns(tenantId: string, runIds: string[]): Promise<LabCompareRow[]> {
    this.assertEnabled();
    const unique = [...new Set(runIds.map((id) => id.trim()).filter(Boolean))];
    if (unique.length < 2) {
      throw new BadRequestException('Provide at least two run ids to compare');
    }
    if (unique.length > 10) {
      throw new BadRequestException('Compare at most 10 runs');
    }

    const runs = await this.db.evalRun.findMany({
      where: { tenantId, id: { in: unique } },
    });
    if (runs.length !== unique.length) {
      throw new NotFoundException('One or more eval runs were not found for this tenant');
    }

    const byId = new Map(runs.map((r) => [r.id, r]));
    return unique.map((id) => {
      const run = byId.get(id)!;
      let configSnapshot: PipelineConfig;
      try {
        configSnapshot = parsePipelineConfig(run.configSnapshot);
      } catch {
        configSnapshot = mergePipelineConfig(
          defaultPipelineConfig,
          (run.configSnapshot ?? {}) as Partial<PipelineConfig>,
        );
      }

      const metrics =
        run.metricsSummary &&
        typeof run.metricsSummary === 'object' &&
        !Array.isArray(run.metricsSummary)
          ? (run.metricsSummary as Record<string, number>)
          : null;

      return {
        runId: run.id,
        label: run.label,
        experimentConfigId: run.experimentConfigId,
        state: run.state,
        configSummary: summarizePipelineConfig(configSnapshot),
        configSnapshot,
        metricsSummary: metrics,
        latencyMsTotal: run.latencyMsTotal,
        estimatedCostUsd: run.estimatedCostUsd,
        itemCount: run.itemCount,
        completedCount: run.completedCount,
      };
    });
  }

  async listRecentRuns(tenantId: string): Promise<EvalRunDto[]> {
    this.assertEnabled();
    return this.evalService.listRuns(tenantId);
  }
}
