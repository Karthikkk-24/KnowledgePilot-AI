import 'reflect-metadata';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadEnv } from '@knowledgepilot/config';
import { createDbClient, ensureStubTenant } from '@knowledgepilot/db';
import { createLogger } from '@knowledgepilot/logger';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const env = loadEnv();
  const logger = createLogger({
    service: 'api',
    level: env.APP_NODE_ENV === 'production' ? 'info' : 'debug',
  });

  const db = createDbClient();
  await ensureStubTenant(db);

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  app.enableCors({
    origin: env.APP_WEB_ORIGIN,
    credentials: true,
  });

  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'ready', method: RequestMethod.GET },
    ],
  });

  await app.listen(env.APP_PORT, '0.0.0.0');
  logger.info('API listening', {
    port: env.APP_PORT,
    origin: env.APP_WEB_ORIGIN,
    llmProvider: env.resolvedLlmProvider,
    embeddingProvider: env.resolvedEmbeddingProvider,
  });
}

void bootstrap();
