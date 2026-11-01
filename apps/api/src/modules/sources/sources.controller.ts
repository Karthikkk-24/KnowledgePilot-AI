import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import type { AuthPrincipal } from '../../auth/auth.types';
import { ok } from '../../common/http';
import { SourcesService } from './sources.service';

@Controller('chunks')
@UseGuards(AuthGuard, RolesGuard)
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Get(':id')
  async get(@CurrentAuth() auth: AuthPrincipal, @Param('id') id: string) {
    return ok(await this.sourcesService.getChunk(auth.tenantId, id));
  }
}
