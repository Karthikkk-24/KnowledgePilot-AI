import {
  AGENT_DEFAULTS,
  DEFAULT_API_ORIGIN,
  DEFAULT_WEB_ORIGIN,
  RAG_DEFAULTS,
} from '@knowledgepilot/shared';

/**
 * Named tunables used as env defaults.
 * Runtime still comes from loadEnv() — change values here (or override via .env).
 */
export const CONFIG_DEFAULTS = {
  app: {
    nodeEnv: 'development' as const,
    port: 3001,
    apiOrigin: DEFAULT_API_ORIGIN,
    webOrigin: DEFAULT_WEB_ORIGIN,
  },
  database: {
    url: 'postgresql://postgres:postgres@localhost:5432/knowledgepilot?schema=public',
  },
  redis: {
    url: 'redis://localhost:6379',
  },
  storage: {
    localPath: './uploads',
    uploadMaxBytes: 20 * 1024 * 1024,
    region: 'us-east-1',
  },
  auth: {
    provider: 'stub' as const,
  },
  rateLimit: {
    ttlMs: 60_000,
    limit: 120,
    uploadLimit: 20,
    chatLimit: 60,
  },
  ingestion: {
    maxAttempts: 5,
    backoffMs: 2000,
    concurrency: 2,
  },
  eval: {
    concurrency: 1,
  },
  llm: {
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
  },
  embedding: {
    model: 'text-embedding-3-small',
    dims: 1536,
  },
  rerank: {
    model: 'rerank-english-v3.0',
    baseUrl: 'https://api.cohere.com/v1',
  },
  rag: {
    defaultTopK: RAG_DEFAULTS.topK,
    defaultChunkSize: RAG_DEFAULTS.chunkSize,
    defaultChunkOverlap: RAG_DEFAULTS.chunkOverlap,
    abstentionThreshold: RAG_DEFAULTS.abstentionThreshold,
    retrievalStrategy: 'hybrid' as const,
  },
  agent: {
    maxSteps: AGENT_DEFAULTS.maxSteps,
    timeoutMs: AGENT_DEFAULTS.timeoutMs,
    maxStepsCap: AGENT_DEFAULTS.maxStepsCap,
    timeoutMsCap: AGENT_DEFAULTS.timeoutMsCap,
  },
  flags: {
    hybridSearch: true,
    reranking: false,
    queryRewrite: false,
    multiQuery: false,
    parentChild: false,
    experimentLab: undefined as boolean | undefined,
    agenticRag: false,
  },
} as const;
