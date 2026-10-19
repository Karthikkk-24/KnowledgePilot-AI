import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadEnv } from '@knowledgepilot/config';
import { createLogger } from '@knowledgepilot/logger';
import { AppModule } from './app.module';

async function bootstrap() {
  const env = loadEnv();
  const logger = createLogger({
    service: 'api',
    level: env.APP_NODE_ENV === 'production' ? 'info' : 'debug',
  });

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

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
  });
}

void bootstrap();
