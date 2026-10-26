import type { LlmClient, LlmMessage } from '../ports/llm-client';

function extractChunkIds(evidence: string): string[] {
  const ids = [...evidence.matchAll(/chunk:([a-zA-Z0-9_-]+)/g)].map((m) => m[1]).filter(Boolean);
  return [...new Set(ids)] as string[];
}

function significantTerms(text: string): Set<string> {
  const stop = new Set([
    'a',
    'an',
    'the',
    'is',
    'are',
    'was',
    'were',
    'what',
    'which',
    'who',
    'whom',
    'where',
    'when',
    'why',
    'how',
    'do',
    'does',
    'did',
    'of',
    'in',
    'on',
    'to',
    'for',
    'and',
    'or',
    'with',
    'about',
    'your',
    'my',
    'our',
  ]);
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2 && !stop.has(t)),
  );
}

function questionSupportedByEvidence(question: string, evidence: string): boolean {
  const qTerms = significantTerms(question);
  if (qTerms.size === 0) return true;
  const eTerms = significantTerms(evidence);
  let hits = 0;
  for (const term of qTerms) {
    if (eTerms.has(term)) hits += 1;
  }
  // Require at least one overlapping content term so nonsense queries abstain under mock LLM.
  return hits > 0;
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

  if (!questionSupportedByEvidence(question, evidence)) {
    return 'INSUFFICIENT_EVIDENCE: retrieved passages do not support this question';
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
