const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type ApiEnvelope<T> = {
  data: T;
  error: { code: string; message: string; details?: Record<string, unknown> } | null;
  meta: { requestId: string };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
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
        citations: Array<{
          chunkId: string;
          documentId: string;
          quote: string;
          page?: number;
          documentTitle?: string;
        }>;
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
};

export function streamChatMessage(
  conversationId: string,
  content: string,
  handlers: {
    onToken: (text: string) => void;
    onCitation: (citation: {
      chunkId: string;
      documentId: string;
      quote: string;
      page?: number;
      documentTitle?: string;
    }) => void;
    onDone: (payload: {
      text: string;
      abstained: boolean;
      citations: Array<{
        chunkId: string;
        documentId: string;
        quote: string;
        page?: number;
        documentTitle?: string;
      }>;
    }) => void;
    onError: (message: string) => void;
  },
): Promise<void> {
  return fetch(`${API_URL}/v1/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
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
            handlers.onCitation(
              data.citation as {
                chunkId: string;
                documentId: string;
                quote: string;
                page?: number;
                documentTitle?: string;
              },
            );
          } else if (eventName === 'done' && data.payload) {
            handlers.onDone(
              data.payload as {
                text: string;
                abstained: boolean;
                citations: Array<{
                  chunkId: string;
                  documentId: string;
                  quote: string;
                  page?: number;
                  documentTitle?: string;
                }>;
              },
            );
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
