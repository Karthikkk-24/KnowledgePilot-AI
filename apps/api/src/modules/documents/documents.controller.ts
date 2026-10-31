import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { MembershipRole } from '@knowledgepilot/db';
import { loadEnv } from '@knowledgepilot/config';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { AuthGuard } from '../../auth/auth.guard';
import { MinRole } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import type { AuthPrincipal } from '../../auth/auth.types';
import { ok } from '../../common/http';
import { DocumentsService } from './documents.service';

const env = loadEnv();

@Controller('documents')
@UseGuards(AuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  async list(@CurrentAuth() auth: AuthPrincipal): Promise<ReturnType<typeof ok>> {
    return ok(await this.documentsService.list(auth.tenantId));
  }

  @Get(':id')
  async get(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id') id: string,
  ): Promise<ReturnType<typeof ok>> {
    return ok(await this.documentsService.get(auth.tenantId, id));
  }

  @Post()
  @MinRole(MembershipRole.member)
  @Throttle({ default: { limit: env.RATE_LIMIT_UPLOAD_LIMIT, ttl: env.RATE_LIMIT_TTL_MS } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: env.UPLOAD_MAX_BYTES },
    }),
  )
  async upload(
    @CurrentAuth() auth: AuthPrincipal,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ReturnType<typeof ok>> {
    return ok(await this.documentsService.upload(auth.tenantId, file));
  }

  @Delete(':id')
  @MinRole(MembershipRole.admin)
  async remove(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id') id: string,
  ): Promise<ReturnType<typeof ok>> {
    return ok(await this.documentsService.softDelete(auth.tenantId, id));
  }

  @Post(':id/retry-ingestion')
  @MinRole(MembershipRole.member)
  async retry(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id') id: string,
  ): Promise<ReturnType<typeof ok>> {
    return ok(await this.documentsService.retryIngestion(auth.tenantId, id));
  }
}
