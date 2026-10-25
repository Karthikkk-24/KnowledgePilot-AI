import type { LlmClient, LlmMessage } from '../ports/llm-client';

function extractChunkIds(evidence: string): string[] {
  const ids = [...evidence.matchAll(/chunk:([a-zA-Z0-9_-]+)/g)].map((m) => m[1]).filter(Boolean);
  return [...new Set(ids)] as string[];
}

function mockAnswerFromMessages(messages: LlmMessage[]): string {
  const user = messages.find((m) => m.role === 'user')?.content ?? '';
  const questionMatch = /Question:\s*([\s\S]+)$/i.exec(user);
  const question = questionMatch?.[1]?.trim() || 'your question';
  const evidence = user.split('Question:')[0] ?? '';
  const chunkIds = extractChunkIds(evidence).slice(0, 3);

  if (chunkIds.length === 0 || /No evidence passages were retrieved/i.test(evidence)) {
    return 'INSUFFICIENT_EVIDENCE: no supporting passages were retrieved';
  }

  const citations = chunkIds.map((id) => `[chunk:${id}]`).join(' ');
  return `Based on the uploaded documents, here is a grounded answer to “${question}”. ${citations}`;
}

export function createMockLlmClient(): LlmClient {
  return {
    model: 'mock-llm',
    async complete(messages) {
      return mockAnswerFromMessages(messages);
    },
    async *stream(messages) {
      const text = mockAnswerFromMessages(messages);
      const parts = text.match(/.{1,24}/g) ?? [text];
      for (const part of parts) {
        yield part;
      }
    },
  };
}
