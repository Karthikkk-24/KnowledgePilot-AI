import type { AppEnv } from '@knowledgepilot/config';
import {
  createMockEmbedder,
  createMockLlmClient,
  createOpenAIEmbedder,
  createOpenAILlmClient,
  type Embedder,
  type LlmClient,
} from '@knowledgepilot/rag';

export function createEmbedder(env: AppEnv): Embedder {
  if (env.resolvedEmbeddingProvider === 'mock') {
    return createMockEmbedder(env.EMBEDDING_DIMS);
  }

  const apiKey = env.EMBEDDING_API_KEY || env.LLM_API_KEY;
  if (!apiKey) {
    return createMockEmbedder(env.EMBEDDING_DIMS);
  }

  return createOpenAIEmbedder({
    apiKey,
    model: env.EMBEDDING_MODEL,
    dimensions: env.EMBEDDING_DIMS,
    baseUrl: env.EMBEDDING_BASE_URL || env.LLM_BASE_URL,
  });
}

export function createLlmClient(env: AppEnv): LlmClient {
  if (env.resolvedLlmProvider === 'mock') {
    return createMockLlmClient();
  }
  if (!env.LLM_API_KEY) {
    return createMockLlmClient();
  }
  return createOpenAILlmClient({
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
    baseUrl: env.LLM_BASE_URL,
  });
}
