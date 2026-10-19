import { Injectable } from '@nestjs/common';
import { createDbClient } from '@knowledgepilot/db';
import { createRagOrchestrator, defaultPipelineConfig } from '@knowledgepilot/rag';
import { APP_NAME, APP_VERSION, type HealthResponse } from '@knowledgepilot/shared';

@Injectable()
export class HealthService {
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: APP_NAME,
      version: APP_VERSION,
    };
  }

  getReady() {
    const db = createDbClient();
    const rag = createRagOrchestrator(defaultPipelineConfig);

    return {
      status: 'ok' as const,
      database: db,
      rag: rag.status(),
    };
  }
}
