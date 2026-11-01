import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@knowledgepilot/db';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { MinRole } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import type { AuthPrincipal } from '../../auth/auth.types';
import { ok } from '../../common/http';
import {
  LabService,
  type ExperimentConfigDto,
  type LabCompareRow,
  type LabStatusDto,
} from './lab.service';
import type { EvalRunDetailDto, EvalRunDto } from '../eval/eval.service';

@Controller('lab')
@UseGuards(AuthGuard, RolesGuard)
export class LabController {
  constructor(private readonly labService: LabService) {}

  @Get('status')
  async status(
    @CurrentAuth() auth: AuthPrincipal,
  ): Promise<ReturnType<typeof ok<LabStatusDto>>> {
    return ok(await this.labService.getStatus(auth.tenantId));
  }

  @Get('configs')
  async listConfigs(
    @CurrentAuth() auth: AuthPrincipal,
  ): Promise<ReturnType<typeof ok<ExperimentConfigDto[]>>> {
    return ok(await this.labService.listConfigs(auth.tenantId));
  }

  @Post('configs/seed')
  @MinRole(MembershipRole.member)
  async seedPresets(
    @CurrentAuth() auth: AuthPrincipal,
  ): Promise<ReturnType<typeof ok<ExperimentConfigDto[]>>> {
    return ok(await this.labService.seedPresets(auth.tenantId));
  }

  @Post('configs')
  @MinRole(MembershipRole.member)
  async createConfig(
    @CurrentAuth() auth: AuthPrincipal,
    @Body()
    body: { name: string; description?: string; config: unknown },
  ): Promise<ReturnType<typeof ok<ExperimentConfigDto>>> {
    return ok(
      await this.labService.createConfig(auth.tenantId, {
        name: body.name,
        description: body.description,
        config: body.config,
      }),
    );
  }

  @Get('configs/:id')
  async getConfig(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id') id: string,
  ): Promise<ReturnType<typeof ok<ExperimentConfigDto>>> {
    return ok(await this.labService.getConfig(auth.tenantId, id));
  }

  @Patch('configs/:id')
  @MinRole(MembershipRole.member)
  async updateConfig(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id') id: string,
    @Body()
    body: { name?: string; description?: string | null; config?: unknown },
  ): Promise<ReturnType<typeof ok<ExperimentConfigDto>>> {
    return ok(await this.labService.updateConfig(auth.tenantId, id, body));
  }

  @Delete('configs/:id')
  @MinRole(MembershipRole.admin)
  async deleteConfig(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id') id: string,
  ): Promise<ReturnType<typeof ok<{ id: string }>>> {
    return ok(await this.labService.deleteConfig(auth.tenantId, id));
  }

  @Post('configs/:id/run')
  @MinRole(MembershipRole.member)
  async runConfig(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id') id: string,
    @Body() body: { benchmarkSetId?: string; label?: string },
  ): Promise<ReturnType<typeof ok<EvalRunDetailDto>>> {
    return ok(
      await this.labService.runConfig(auth.tenantId, id, {
        benchmarkSetId: body?.benchmarkSetId,
        label: body?.label,
      }),
    );
  }

  @Post('compare')
  async compare(
    @CurrentAuth() auth: AuthPrincipal,
    @Body() body: { runIds: string[] },
  ): Promise<ReturnType<typeof ok<LabCompareRow[]>>> {
    return ok(await this.labService.compareRuns(auth.tenantId, body?.runIds ?? []));
  }

  @Get('runs')
  async listRuns(
    @CurrentAuth() auth: AuthPrincipal,
  ): Promise<ReturnType<typeof ok<EvalRunDto[]>>> {
    return ok(await this.labService.listRecentRuns(auth.tenantId));
  }
}
