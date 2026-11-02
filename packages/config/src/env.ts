import { z } from 'zod';
import { CONFIG_DEFAULTS as D } from './defaults';

const boolFromEnv = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    if (value === undefined || value === '') return undefined;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  });

const envSchema = z.object({
  APP_NODE_ENV: z.enum(['development', 'test', 'production']).default(D.app.nodeEnv),
  APP_PORT: z.coerce.number().int().positive().default(D.app.port),
  APP_WEB_ORIGIN: z.string().url().default(D.app.webOrigin),
  DB_DATABASE_URL: z.string().min(1).default(D.database.url),
  REDIS_URL: z.string().min(1).default(D.redis.url),
  STORAGE_LOCAL_PATH: z.string().default(D.storage.localPath),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(D.storage.uploadMaxBytes),
  STORAGE_BUCKET: z.string().optional().default(''),
  STORAGE_REGION: z.string().optional().default(D.storage.region),
  STORAGE_ACCESS_KEY: z.string().optional().default(''),
  STORAGE_SECRET_KEY: z.string().optional().default(''),
  STORAGE_ENDPOINT: z.string().optional().default(''),
  AUTH_PROVIDER: z.enum(['stub', 'clerk']).default(D.auth.provider),
  AUTH_SECRET: z.string().optional().default(''),
  CLERK_SECRET_KEY: z.string().optional().default(''),
  CLERK_PUBLISHABLE_KEY: z.string().optional().default(''),
  CLERK_JWT_KEY: z.string().optional().default(''),
  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(D.rateLimit.ttlMs),
  RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(D.rateLimit.limit),
  RATE_LIMIT_UPLOAD_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(D.rateLimit.uploadLimit),
  RATE_LIMIT_CHAT_LIMIT: z.coerce.number().int().positive().default(D.rateLimit.chatLimit),
  INGESTION_MAX_ATTEMPTS: z.coerce
    .number()
    .int()
    .positive()
    .default(D.ingestion.maxAttempts),
  INGESTION_BACKOFF_MS: z.coerce.number().int().positive().default(D.ingestion.backoffMs),
  INGESTION_CONCURRENCY: z.coerce
    .number()
    .int()
    .positive()
    .default(D.ingestion.concurrency),
  EVAL_CONCURRENCY: z.coerce.number().int().positive().default(D.eval.concurrency),
  LLM_API_KEY: z.string().optional().default(''),
  LLM_MODEL: z.string().default(D.llm.model),
  LLM_BASE_URL: z.string().default(D.llm.baseUrl),
  LLM_PROVIDER: z.enum(['openai', 'mock']).optional(),
  EMBEDDING_API_KEY: z.string().optional().default(''),
  EMBEDDING_MODEL: z.string().default(D.embedding.model),
  EMBEDDING_DIMS: z.coerce.number().int().positive().default(D.embedding.dims),
  EMBEDDING_BASE_URL: z.string().optional(),
  EMBEDDING_PROVIDER: z.enum(['openai', 'mock']).optional(),
  RERANK_API_KEY: z.string().optional().default(''),
  RERANK_MODEL: z.string().default(D.rerank.model),
  RERANK_BASE_URL: z.string().default(D.rerank.baseUrl),
  RERANK_PROVIDER: z.enum(['http', 'mock']).optional(),
  RAG_DEFAULT_TOP_K: z.coerce.number().int().positive().default(D.rag.defaultTopK),
  RAG_DEFAULT_CHUNK_SIZE: z.coerce
    .number()
    .int()
    .positive()
    .default(D.rag.defaultChunkSize),
  RAG_DEFAULT_CHUNK_OVERLAP: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(D.rag.defaultChunkOverlap),
  RAG_ABSTENTION_THRESHOLD: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(D.rag.abstentionThreshold),
  RAG_RETRIEVAL_STRATEGY: z
    .enum(['vector', 'keyword', 'hybrid'])
    .default(D.rag.retrievalStrategy),
  FF_HYBRID_SEARCH: boolFromEnv,
  FF_RERANKING: boolFromEnv,
  FF_QUERY_REWRITE: boolFromEnv,
  FF_PARENT_CHILD: boolFromEnv,
  FF_EXPERIMENT_LAB: boolFromEnv,
  FF_MULTI_QUERY: boolFromEnv,
  FF_AGENTIC_RAG: boolFromEnv,
  AGENT_MAX_STEPS: z.coerce
    .number()
    .int()
    .positive()
    .max(D.agent.maxStepsCap)
    .default(D.agent.maxSteps),
  AGENT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(D.agent.timeoutMsCap)
    .default(D.agent.timeoutMs),
});

export type AppEnv = z.infer<typeof envSchema> & {
  resolvedLlmProvider: 'openai' | 'mock';
  resolvedEmbeddingProvider: 'openai' | 'mock';
  resolvedRerankProvider: 'http' | 'mock';
  hybridSearchEnabled: boolean;
  rerankingEnabled: boolean;
  objectStorageEnabled: boolean;
  queryRewriteEnabled: boolean;
  multiQueryEnabled: boolean;
  parentChildEnabled: boolean;
  experimentLabEnabled: boolean;
  agenticRagEnabled: boolean;
};

/** Treat blank env strings as unset so CONFIG_DEFAULTS / zod defaults apply. */
function normalizeEnvSource(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...source };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value === 'string' && value.trim() === '') {
      delete out[key];
    }
  }
  return out;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(normalizeEnvSource(source));
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment configuration: ${JSON.stringify(details)}`);
  }

  const data = parsed.data;
  if (data.APP_NODE_ENV === 'production' && data.AUTH_PROVIDER === 'stub') {
    throw new Error('AUTH_PROVIDER=stub is not allowed when APP_NODE_ENV=production');
  }
  if (data.AUTH_PROVIDER === 'clerk' && !data.CLERK_SECRET_KEY.trim()) {
    throw new Error('CLERK_SECRET_KEY is required when AUTH_PROVIDER=clerk');
  }

  const resolvedLlmProvider =
    data.LLM_PROVIDER ?? (data.LLM_API_KEY.trim().length > 0 ? 'openai' : 'mock');
  const resolvedEmbeddingProvider =
    data.EMBEDDING_PROVIDER ??
    (data.EMBEDDING_API_KEY.trim().length > 0 || data.LLM_API_KEY.trim().length > 0
      ? 'openai'
      : 'mock');
  const resolvedRerankProvider =
    data.RERANK_PROVIDER ?? (data.RERANK_API_KEY.trim().length > 0 ? 'http' : 'mock');

  const hybridSearchEnabled = data.FF_HYBRID_SEARCH ?? D.flags.hybridSearch;
  const rerankingEnabled = data.FF_RERANKING ?? D.flags.reranking;
  const queryRewriteEnabled = data.FF_QUERY_REWRITE ?? D.flags.queryRewrite;
  const multiQueryEnabled = data.FF_MULTI_QUERY ?? D.flags.multiQuery;
  const parentChildEnabled = data.FF_PARENT_CHILD ?? D.flags.parentChild;
  const experimentLabEnabled =
    data.FF_EXPERIMENT_LAB ?? data.APP_NODE_ENV !== 'production';
  const agenticRagEnabled = data.FF_AGENTIC_RAG ?? D.flags.agenticRag;
  const objectStorageEnabled =
    data.STORAGE_BUCKET.trim().length > 0 &&
    data.STORAGE_ACCESS_KEY.trim().length > 0 &&
    data.STORAGE_SECRET_KEY.trim().length > 0;

  return {
    ...data,
    resolvedLlmProvider,
    resolvedEmbeddingProvider,
    resolvedRerankProvider,
    hybridSearchEnabled,
    rerankingEnabled,
    objectStorageEnabled,
    queryRewriteEnabled,
    multiQueryEnabled,
    parentChildEnabled,
    experimentLabEnabled,
    agenticRagEnabled,
  };
}
