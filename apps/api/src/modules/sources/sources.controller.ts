import { Controller, Get, Param } from '@nestjs/common';
import { ok } from '../../common/http';
import { SourcesService } from './sources.service';

@Controller('chunks')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Get(':id')
  async get(@Param('id') id: string) {
    return ok(await this.sourcesService.getChunk(id));
  }
}
