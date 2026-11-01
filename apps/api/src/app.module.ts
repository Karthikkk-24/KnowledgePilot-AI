import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { loadEnv } from '@knowledgepilot/config';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { ChatModule } from './modules/chat/chat.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { EvalModule } from './modules/eval/eval.module';
import { HealthModule } from './modules/health/health.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { LabModule } from './modules/lab/lab.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SourcesModule } from './modules/sources/sources.module';

const env = loadEnv();

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: env.RATE_LIMIT_TTL_MS,
        limit: env.RATE_LIMIT_LIMIT,
      },
    ]),
    BullModule.forRoot({
      connection: {
        url: env.REDIS_URL,
      },
    }),
    AuthModule,
    HealthModule,
    DocumentsModule,
    IngestionModule,
    ChatModule,
    SourcesModule,
    EvalModule,
    LabModule,
    SettingsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
