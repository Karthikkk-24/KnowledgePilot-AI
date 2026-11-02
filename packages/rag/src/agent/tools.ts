import type { AgentKnowledgeAccess } from './knowledge';
import type { AgentAction, AgentToolName, AgentToolResult } from './types';
import type { RetrievalStrategy } from '../types';

const ALLOWED = new Set<AgentToolName>([
  'search_knowledge',
  'get_chunk',
  'list_documents',
  'finish',
]);

export function isAllowedTool(name: string): name is AgentToolName {
  return ALLOWED.has(name as AgentToolName);
}

export type ToolRuntimeOptions = {
  knowledge: AgentKnowledgeAccess;
  topK: number;
  retrievalStrategy: RetrievalStrategy;
};

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

/**
 * Execute an allowlisted tool. tenantId is baked into knowledge — never taken from args.
 */
export async function executeAgentTool(
  action: AgentAction,
  options: ToolRuntimeOptions,
): Promise<AgentToolResult> {
  if (action.name === 'finish') {
    const answer = asString(action.args.answer);
    return {
      ok: Boolean(answer),
      summary: answer ? `finish (${answer.length} chars)` : 'finish missing answer',
      data: { answer },
    };
  }

  const args = action.args as Record<string, unknown>;

  if (action.name === 'search_knowledge') {
    const query = asString(args.query);
    if (!query) {
      return { ok: false, summary: 'search_knowledge requires query' };
    }
    const hits = await options.knowledge.search({
      query,
      topK: options.topK,
      strategy: options.retrievalStrategy,
    });
    const preview = hits
      .slice(0, 5)
      .map(
        (h) =>
          `- chunk:${h.id} doc:${h.documentId} score=${h.score.toFixed(3)} :: ${h.content.slice(0, 160)}`,
      )
      .join('\n');
    return {
      ok: true,
      summary: `search_knowledge returned ${hits.length} hit(s)`,
      data: { hits: hits.map((h) => ({ id: h.id, documentId: h.documentId, content: h.content, score: h.score })) },
      chunkIds: hits.map((h) => h.id),
    };
  }

  if (action.name === 'get_chunk') {
    const chunkId = asString(args.chunkId);
    if (!chunkId) {
      return { ok: false, summary: 'get_chunk requires chunkId' };
    }
    const chunk = await options.knowledge.getChunk(chunkId);
    if (!chunk) {
      return { ok: false, summary: `chunk not found: ${chunkId}` };
    }
    return {
      ok: true,
      summary: `get_chunk ${chunkId} (${chunk.content.length} chars)`,
      data: {
        id: chunk.id,
        documentId: chunk.documentId,
        content: chunk.content,
        documentTitle: chunk.documentTitle,
      },
      chunkIds: [chunk.id],
    };
  }

  if (action.name === 'list_documents') {
    const docs = await options.knowledge.listDocuments();
    return {
      ok: true,
      summary: `list_documents returned ${docs.length} document(s)`,
      data: { documents: docs },
    };
  }

  return { ok: false, summary: 'unknown tool' };
}

export function truncateToolObservation(result: AgentToolResult, maxChars = 2400): string {
  if (result.data === undefined) return result.summary;
  const raw = JSON.stringify(result.data);
  return `${result.summary}\n${raw.slice(0, maxChars)}${raw.length > maxChars ? '…' : ''}`;
}
