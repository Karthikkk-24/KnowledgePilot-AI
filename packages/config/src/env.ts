import { z } from 'zod';

const boolFromEnv = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    if (value === undefined || value === '') return undefined;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  });

const envSchema = z.object({
  APP_NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_PORT: z.coerce.number().int().positive().default(3001),
  APP_WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  DB_DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://postgres:postgres@localhost:5432/knowledgepilot?schema=public'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  STORAGE_LOCAL_PATH: z.string().default('./uploads'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(20 * 1024 * 1024),
  LLM_API_KEY: z.string().optional().default(''),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
  LLM_BASE_URL: z.string().default('https://api.openai.com/v1'),
  LLM_PROVIDER: z.enum(['openai', 'mock']).optional(),
  EMBEDDING_API_KEY: z.string().optional().default(''),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMS: z.coerce.number().int().positive().default(1536),
  EMBEDDING_BASE_URL: z.string().optional(),
  EMBEDDING_PROVIDER: z.enum(['openai', 'mock']).optional(),
  RERANK_API_KEY: z.string().optional().default(''),
  RERANK_MODEL: z.string().default('rerank-english-v3.0'),
  RERANK_BASE_URL: z.string().default('https://api.cohere.com/v1'),
  RERANK_PROVIDER: z.enum(['http', 'mock']).optional(),
  RAG_DEFAULT_TOP_K: z.coerce.number().int().positive().default(8),
  RAG_DEFAULT_CHUNK_SIZE: z.coerce.number().int().positive().default(800),
  RAG_DEFAULT_CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(120),
  RAG_ABSTENTION_THRESHOLD: z.coerce.number().min(0).max(1).default(0.15),
  RAG_RETRIEVAL_STRATEGY: z.enum(['vector', 'keyword', 'hybrid']).default('hybrid'),
  FF_HYBRID_SEARCH: boolFromEnv,
  FF_RERANKING: boolFromEnv,
  FF_QUERY_REWRITE: boolFromEnv,
  FF_PARENT_CHILD: boolFromEnv,
  FF_EXPERIMENT_LAB: boolFromEnv,
  FF_MULTI_QUERY: boolFromEnv,
});

export type AppEnv = z.infer<typeof envSchema> & {
  resolvedLlmProvider: 'openai' | 'mock';
  resolvedEmbeddingProvider: 'openai' | 'mock';
  resolvedRerankProvider: 'http' | 'mock';
  hybridSearchEnabled: boolean;
  rerankingEnabled: boolean;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment configuration: ${JSON.stringify(details)}`);
  }

  const data = parsed.data;
  const resolvedLlmProvider =
    data.LLM_PROVIDER ?? (data.LLM_API_KEY.trim().length > 0 ? 'openai' : 'mock');
  const resolvedEmbeddingProvider =
    data.EMBEDDING_PROVIDER ??
    (data.EMBEDDING_API_KEY.trim().length > 0 || data.LLM_API_KEY.trim().length > 0
      ? 'openai'
      : 'mock');
  const resolvedRerankProvider =
    data.RERANK_PROVIDER ?? (data.RERANK_API_KEY.trim().length > 0 ? 'http' : 'mock');

  const hybridSearchEnabled = data.FF_HYBRID_SEARCH ?? true;
  const rerankingEnabled = data.FF_RERANKING ?? false;

  return {
    ...data,
    resolvedLlmProvider,
    resolvedEmbeddingProvider,
    resolvedRerankProvider,
    hybridSearchEnabled,
    rerankingEnabled,
  };
}
