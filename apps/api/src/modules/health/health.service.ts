import { Injectable } from '@nestjs/common';
import { createDbClient, STUB_TENANT_ID } from '@knowledgepilot/db';
import { loadEnv } from '@knowledgepilot/config';
import { APP_NAME, APP_VERSION, type HealthResponse } from '@knowledgepilot/shared';

@Injectable()
export class HealthService {
  private readonly db = createDbClient();
  private readonly env = loadEnv();

  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: APP_NAME,
      version: APP_VERSION,
    };
  }

  async getReady() {
    let database: { ready: boolean; reason?: string } = { ready: false };
    try {
      await this.db.$queryRaw`SELECT 1`;
      const tenant = await this.db.tenant.findUnique({ where: { id: STUB_TENANT_ID } });
      database = tenant
        ? { ready: true }
        : { ready: false, reason: 'Stub tenant missing' };
    } catch (error) {
      database = {
        ready: false,
        reason: error instanceof Error ? error.message : 'database unavailable',
      };
    }

    return {
      status: database.ready ? ('ok' as const) : ('degraded' as const),
      database,
      providers: {
        llm: this.env.resolvedLlmProvider,
        embedding: this.env.resolvedEmbeddingProvider,
      },
    };
  }
}
