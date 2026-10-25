import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { loadEnv } from '@knowledgepilot/config';
import { ChatModule } from './modules/chat/chat.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { HealthModule } from './modules/health/health.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { SourcesModule } from './modules/sources/sources.module';

const env = loadEnv();

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        url: env.REDIS_URL,
      },
    }),
    HealthModule,
    DocumentsModule,
    IngestionModule,
    ChatModule,
    SourcesModule,
  ],
})
export class AppModule {}
