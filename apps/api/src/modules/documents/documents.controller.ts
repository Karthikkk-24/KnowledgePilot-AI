import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { loadEnv } from '@knowledgepilot/config';
import { ok } from '../../common/http';
import { DocumentsService } from './documents.service';

const env = loadEnv();

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  async list(): Promise<ReturnType<typeof ok>> {
    return ok(await this.documentsService.list());
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<ReturnType<typeof ok>> {
    return ok(await this.documentsService.get(id));
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: env.UPLOAD_MAX_BYTES },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File): Promise<ReturnType<typeof ok>> {
    return ok(await this.documentsService.upload(file));
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<ReturnType<typeof ok>> {
    return ok(await this.documentsService.softDelete(id));
  }

  @Post(':id/retry-ingestion')
  async retry(@Param('id') id: string): Promise<ReturnType<typeof ok>> {
    return ok(await this.documentsService.retryIngestion(id));
  }
}
