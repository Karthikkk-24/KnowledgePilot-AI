const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_PROVIDER ?? 'stub';

export type ApiEnvelope<T> = {
  data: T;
  error: { code: string; message: string; details?: Record<string, unknown> } | null;
  meta: { requestId: string };
};

function authHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  if (AUTH_MODE === 'stub') {
    // Optional overrides for multi-tenant demos / isolation tests from the browser.
    if (typeof window !== 'undefined') {
      const userId = window.localStorage.getItem('kp_user_id');
      const tenantId = window.localStorage.getItem('kp_tenant_id');
      if (userId) headers['x-kp-user-id'] = userId;
      if (tenantId) headers['x-kp-tenant-id'] = tenantId;
    }
  }
  return headers;
}

export type RetrievalStrategy = 'vector' | 'keyword' | 'hybrid';

export type ChatFilters = {
  documentIds?: string[];
  mimeTypes?: string[];
  tags?: string[];
  createdAfter?: string;
  createdBefore?: string;
};

export type ChatStreamOptions = {
  retrievalStrategy?: RetrievalStrategy;
  rerankingEnabled?: boolean;
  topK?: number;
  filters?: ChatFilters;
};

export type AnswerDiagnostics = {
  retrievalStrategy: RetrievalStrategy;
  rerankingEnabled: boolean;
  queryRewriteEnabled?: boolean;
  multiQueryEnabled?: boolean;
  contextCompressionEnabled?: boolean;
  rewrittenQuery?: string;
  multiQueries?: string[];
  retrievedChunkIds: string[];
  rerankedChunkIds?: string[];
  invalidCitationIds?: string[];
  latencyMs: Record<string, number>;
  topScore?: number;
  scoreKind?: string;
};

export type AnswerCitation = {
  chunkId: string;
  documentId: string;
  quote: string;
  page?: number;
  documentTitle?: string;
};

export type AnswerPayload = {
  text: string;
  abstained: boolean;
  abstentionReason?: string;
  citations: AnswerCitation[];
  diagnostics: AnswerDiagnostics;
};

export type PipelineConfig = {
  retrievalStrategy: RetrievalStrategy;
  chunkingStrategy: 'fixed' | 'structure_aware' | 'parent_child';
  rerankingEnabled: boolean;
  topK: number;
  rerankTopN: number;
  candidateMultiplier: number;
  queryRewriteEnabled: boolean;
  multiQueryEnabled: boolean;
  contextCompressionEnabled: boolean;
  abstentionThreshold: number;
  rrfK: number;
};

export type ExperimentConfig = {
  id: string;
  name: string;
  description: string | null;
  config: PipelineConfig;
  summary: string;
  createdAt: string;
  updatedAt: string;
};

export type LabCompareRow = {
  runId: string;
  label: string | null;
  experimentConfigId: string | null;
  state: string;
  configSummary: string;
  configSnapshot: PipelineConfig;
  metricsSummary: Record<string, number> | null;
  latencyMsTotal: number | null;
  estimatedCostUsd: number | null;
  itemCount: number;
  completedCount: number;
};

export type LabStatus = {
  enabled: boolean;
  flags: {
    queryRewrite: boolean;
    multiQuery: boolean;
    parentChild: boolean;
    reranking: boolean;
    hybridSearch: boolean;
  };
  documentChunking: Array<{ strategy: string; count: number }>;
};

export type EvalRunSummary = {
  id: string;
  label: string | null;
  state: string;
  progress: number;
  itemCount: number;
  completedCount: number;
  metricsSummary: Record<string, unknown> | null;
  latencyMsTotal: number | null;
  estimatedCostUsd: number | null;
  errorMessage: string | null;
  configSnapshot: Record<string, unknown>;
  experimentConfigId?: string | null;
  benchmarkSet: { id: string; name: string; version: string };
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type EvalRunDetail = EvalRunSummary & {
  items: Array<{
    id: string;
    benchmarkItemId: string;
    question: string;
    expectedAnswer: string | null;
    retrievedChunkIds: string[];
    citedChunkIds: string[];
    answerText: string | null;
    abstained: boolean;
    metrics: Record<string, unknown>;
    latencyMs: Record<string, unknown>;
    errorMessage: string | null;
  }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = {
    ...authHeaders(),
    ...(init?.headers as Record<string, string> | undefined),
  };
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const json = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || json.error) {
    throw new Error(json.error?.message || `Request failed (${response.status})`);
  }
  return json.data;
}

export const api = {
  listDocuments: () =>
    request<
      Array<{
        id: string;
        title: string;
        originalFilename: string;
        mimeType: string;
        byteSize: number;
        status: string;
        errorMessage?: string | null;
        createdAt: string;
        updatedAt: string;
      }>
    >('/v1/documents'),

  uploadDocument: async (file: File) => {
    const body = new FormData();
    body.append('file', file);
    return request<{
      id: string;
      title: string;
      status: string;
      deduplicated?: boolean;
    }>('/v1/documents', { method: 'POST', body });
  },

  retryIngestion: (id: string) =>
    request(`/v1/documents/${id}/retry-ingestion`, { method: 'POST' }),

  deleteDocument: (id: string) =>
    request(`/v1/documents/${id}`, { method: 'DELETE' }),

  listConversations: () =>
    request<Array<{ id: string; title: string | null; createdAt: string; updatedAt: string }>>(
      '/v1/conversations',
    ),

  createConversation: (title?: string) =>
    request<{ id: string; title: string | null }>('/v1/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }),

  getConversation: (id: string) =>
    request<{
      id: string;
      title: string | null;
      messages: Array<{
        id: string;
        role: 'user' | 'assistant' | 'system';
        content: string;
        abstained: boolean;
        citations: AnswerCitation[];
        createdAt: string;
      }>;
    }>(`/v1/conversations/${id}`),

  getChunk: (id: string) =>
    request<{
      id: string;
      documentId: string;
      content: string;
      headingPath: string | null;
      pageStart: number | null;
      pageEnd: number | null;
      document: { id: string; title: string; originalFilename: string };
    }>(`/v1/chunks/${id}`),

  listBenchmarks: () =>
    request<
      Array<{
        id: string;
        name: string;
        version: string;
        description: string | null;
        itemCount: number;
        createdAt: string;
        updatedAt: string;
      }>
    >('/v1/benchmarks'),

  seedBenchmark: () =>
    request<{
      id: string;
      name: string;
      version: string;
      items: unknown[];
    }>('/v1/benchmarks/seed', { method: 'POST' }),

  listEvalRuns: () => request<EvalRunSummary[]>('/v1/eval/runs'),

  getEvalRun: (id: string) => request<EvalRunDetail>(`/v1/eval/runs/${id}`),

  startEvalRun: (body?: {
    benchmarkSetId?: string;
    label?: string;
    retrievalStrategy?: RetrievalStrategy;
    rerankingEnabled?: boolean;
    topK?: number;
  }) =>
    request<EvalRunDetail>('/v1/eval/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),

  getSettings: () =>
    request<{
      tenant: { id: string; name: string; slug: string; createdAt: string };
      role: string | null;
      members: Array<{
        userId: string;
        email: string | null;
        name: string | null;
        role: string;
        createdAt: string;
      }>;
    }>('/v1/settings'),

  getMe: () =>
    request<{
      userId: string;
      tenantId: string;
      role: string;
      email?: string | null;
      name?: string | null;
    }>('/v1/settings/me'),

  updateTenantName: (name: string) =>
    request<{ id: string; name: string; slug: string }>('/v1/settings/tenant', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

  getLabStatus: () => request<LabStatus>('/v1/lab/status'),

  listExperimentConfigs: () => request<ExperimentConfig[]>('/v1/lab/configs'),

  seedExperimentPresets: () =>
    request<ExperimentConfig[]>('/v1/lab/configs/seed', { method: 'POST' }),

  createExperimentConfig: (body: {
    name: string;
    description?: string;
    config: PipelineConfig;
  }) =>
    request<ExperimentConfig>('/v1/lab/configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  runExperimentConfig: (
    id: string,
    body?: { benchmarkSetId?: string; label?: string },
  ) =>
    request<EvalRunDetail>(`/v1/lab/configs/${id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),

  compareLabRuns: (runIds: string[]) =>
    request<LabCompareRow[]>('/v1/lab/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runIds }),
    }),

  listLabRuns: () => request<EvalRunSummary[]>('/v1/lab/runs'),
};

export function streamChatMessage(
  conversationId: string,
  content: string,
  handlers: {
    onToken: (text: string) => void;
    onCitation: (citation: AnswerCitation) => void;
    onDiagnostics?: (diagnostics: AnswerDiagnostics) => void;
    onDone: (payload: AnswerPayload) => void;
    onError: (message: string) => void;
  },
  options?: ChatStreamOptions,
): Promise<void> {
  return fetch(`${API_URL}/v1/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({
      content,
      retrievalStrategy: options?.retrievalStrategy,
      rerankingEnabled: options?.rerankingEnabled,
      topK: options?.topK,
      filters: options?.filters,
    }),
  }).then(async (response) => {
    if (!response.ok || !response.body) {
      handlers.onError(`Chat request failed (${response.status})`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventName = 'message';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';

      for (const line of parts) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
          continue;
        }
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        try {
          const data = JSON.parse(raw) as Record<string, unknown>;
          if (eventName === 'token' && typeof data.text === 'string') {
            handlers.onToken(data.text);
          } else if (eventName === 'citation' && data.citation) {
            handlers.onCitation(data.citation as AnswerCitation);
          } else if (eventName === 'diagnostics' && data.diagnostics) {
            handlers.onDiagnostics?.(data.diagnostics as AnswerDiagnostics);
          } else if (eventName === 'done' && data.payload) {
            handlers.onDone(data.payload as AnswerPayload);
          } else if (eventName === 'error') {
            handlers.onError(String(data.message ?? 'Stream error'));
          }
        } catch {
          // ignore malformed SSE
        }
      }
    }
  });
}

export { API_URL };
