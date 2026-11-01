import { describe, expect, it } from 'vitest';
import { createMockEmbedder } from '../providers/mock-embedder';
import { createMockLlmClient } from '../providers/mock-llm';
import type { RetrievedChunk } from '../ports/chunk-repository';
import { createAgentLoop } from './agent-loop';
import type { AgentKnowledgeAccess } from './knowledge';
import { parsePlannerResponse } from './planner';
import { isAllowedTool } from './tools';

function knowledgeWith(hitsByQuery: Record<string, RetrievedChunk[]>): AgentKnowledgeAccess {
  return {
    async search({ query }) {
      const key = Object.keys(hitsByQuery).find((k) =>
        query.toLowerCase().includes(k.toLowerCase()),
      );
      return key ? (hitsByQuery[key] ?? []) : [];
    },
    async getChunk(chunkId) {
      for (const hits of Object.values(hitsByQuery)) {
        const found = hits.find((h) => h.id === chunkId);
        if (found) return found;
      }
      return null;
    },
    async listDocuments() {
      return [{ id: 'doc-a', title: 'Atlas', mimeType: 'text/markdown', status: 'ready' }];
    },
  };
}

describe('agent tools allowlist', () => {
  it('allows only safe tools', () => {
    expect(isAllowedTool('search_knowledge')).toBe(true);
    expect(isAllowedTool('shell')).toBe(false);
    expect(isAllowedTool('sql')).toBe(false);
  });
});

describe('parsePlannerResponse', () => {
  it('parses JSON action objects', () => {
    const turn = parsePlannerResponse(
      '{"action":"search_knowledge","args":{"query":"DB-7"},"thought":"hop"}',
    );
    expect(turn?.action.name).toBe('search_knowledge');
    expect(turn?.thought).toBe('hop');
  });
});

describe('createAgentLoop', () => {
  it('runs multi-hop search then finishes with validated citations', async () => {
    const knowledge = knowledgeWith({
      Atlas: [
        {
          id: 'chk_atlas',
          documentId: 'doc-a',
          content: 'Product Atlas uses database cluster DB-7.',
          score: 0.9,
          scoreKind: 'cosine',
        },
      ],
      'DB-7': [
        {
          id: 'chk_db7',
          documentId: 'doc-b',
          content: 'DB-7 backup window is 02:00–04:00 UTC.',
          score: 0.88,
          scoreKind: 'cosine',
        },
      ],
    });

    const agent = createAgentLoop({
      llm: createMockLlmClient(),
      knowledge,
      embedder: createMockEmbedder(8),
      abstentionThreshold: 0.15,
    });

    const result = await agent.answer({
      query: 'What is the backup window for the database used by Product Atlas?',
      config: { maxSteps: 5, timeoutMs: 10_000, topK: 4, retrievalStrategy: 'vector' },
    });

    expect(result.diagnostics.agentMode).toBe(true);
    expect(result.diagnostics.agentStepCount).toBeGreaterThanOrEqual(2);
    expect(result.diagnostics.agentSteps.some((s) => s.tool === 'search_knowledge')).toBe(true);
    expect(result.abstained).toBe(false);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.diagnostics.retrievedChunkIds).toEqual(
      expect.arrayContaining(['chk_atlas', 'chk_db7']),
    );
  });

  it('cannot fetch chunks from another tenant via knowledge binding', async () => {
    const foreignOnly: AgentKnowledgeAccess = {
      async search() {
        return [];
      },
      async getChunk() {
        return null;
      },
      async listDocuments() {
        return [];
      },
    };
    const agent = createAgentLoop({
      llm: createMockLlmClient(),
      knowledge: foreignOnly,
      abstentionThreshold: 0.15,
    });
    const result = await agent.answer({
      query: 'What is ERR-4421?',
      config: { maxSteps: 3, timeoutMs: 5_000, topK: 3, retrievalStrategy: 'vector' },
    });
    expect(result.abstained).toBe(true);
  });

  it('stops at maxSteps', async () => {
    const knowledge = knowledgeWith({
      anything: [
        {
          id: 'chk_1',
          documentId: 'doc-1',
          content: 'noop',
          score: 0.5,
          scoreKind: 'cosine',
        },
      ],
    });
    // Force planner to keep searching by using a query that always multi-hops but
    // knowledge only returns on first pattern — still finishes via synthesize after cap.
    const agent = createAgentLoop({
      llm: createMockLlmClient(),
      knowledge,
      abstentionThreshold: 0.15,
    });
    const result = await agent.answer({
      query: 'list documents please',
      config: { maxSteps: 2, timeoutMs: 5_000, topK: 3, retrievalStrategy: 'vector' },
    });
    expect(result.diagnostics.agentStepCount).toBeLessThanOrEqual(2);
  });
});
