import type { LlmClient } from '../ports/llm-client';
import { isAllowedTool } from './tools';
import type { AgentAction, AgentToolResult } from './types';

const PLANNER_SYSTEM = `You are a knowledge agent with ONLY these tools:
- search_knowledge: {"query": string}
- get_chunk: {"chunkId": string}
- list_documents: {}
- finish: {"answer": string}  // final grounded answer; cite as [chunk:ID]; or INSUFFICIENT_EVIDENCE: reason

Respond with a single JSON object: {"action":"<tool>","args":{...},"thought":"..."}.
No markdown fences. Prefer search_knowledge before finish. Never invent chunk ids.`;

export type PlannerTurn = {
  thought?: string;
  action: AgentAction;
};

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fence?.[1]?.trim() ?? trimmed;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function parsePlannerResponse(raw: string): PlannerTurn | null {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const actionName = typeof obj.action === 'string' ? obj.action : '';
  if (!isAllowedTool(actionName)) return null;
  const args =
    obj.args && typeof obj.args === 'object' && !Array.isArray(obj.args)
      ? (obj.args as Record<string, unknown>)
      : {};
  const thought = typeof obj.thought === 'string' ? obj.thought : undefined;

  if (actionName === 'finish') {
    return {
      thought,
      action: { name: 'finish', args: { answer: String(args.answer ?? '') } },
    };
  }
  return {
    thought,
    action: { name: actionName, args },
  };
}

/** Deterministic offline planner for mock LLM — multi-hop does a second focused search. */
export function mockPlanNext(input: {
  query: string;
  step: number;
  observations: string[];
  evidenceChunkIds: string[];
}): PlannerTurn {
  const { query, step, evidenceChunkIds } = input;
  const lower = query.toLowerCase();

  if (step === 0) {
    if (/what documents|list (all )?docs|which files/i.test(query)) {
      return {
        thought: 'List corpus before answering',
        action: { name: 'list_documents', args: {} },
      };
    }
    return {
      thought: 'Primary retrieval',
      action: { name: 'search_knowledge', args: { query } },
    };
  }

  // Multi-hop: follow up when the question bridges two entities (e.g. product → DB → window).
  const multiHop =
    /used by|backup window|depends on|which database|for the database/i.test(query) ||
    (lower.includes(' and ') && lower.includes('?'));

  if (step === 1 && multiHop && evidenceChunkIds.length > 0) {
    let followUp = query;
    if (/atlas/i.test(query) && /backup|window/i.test(query)) {
      followUp = 'DB-7 backup window';
    } else if (/retention/i.test(query) && /escalation|ERR/i.test(query)) {
      followUp = 'ERR-4421 escalation';
    } else {
      const tokens = query
        .split(/\W+/)
        .filter((t) => t.length > 3)
        .slice(-3)
        .join(' ');
      followUp = tokens || query;
    }
    return {
      thought: 'Second hop retrieval',
      action: { name: 'search_knowledge', args: { query: followUp } },
    };
  }

  if (evidenceChunkIds.length === 0) {
    return {
      thought: 'No evidence',
      action: {
        name: 'finish',
        args: { answer: 'INSUFFICIENT_EVIDENCE: no supporting passages were retrieved' },
      },
    };
  }

  const cites = evidenceChunkIds
    .slice(0, 3)
    .map((id) => `[chunk:${id}]`)
    .join(' ');
  return {
    thought: 'Synthesize grounded answer',
    action: {
      name: 'finish',
      args: {
        answer: `Based on the retrieved knowledge for “${query}”. ${cites}`,
      },
    },
  };
}

export async function planNextAction(input: {
  llm: LlmClient;
  query: string;
  step: number;
  observations: string[];
  evidenceChunkIds: string[];
}): Promise<PlannerTurn> {
  if (input.llm.model.startsWith('mock')) {
    return mockPlanNext(input);
  }

  const history = input.observations.map((o, i) => `Step ${i + 1} observation:\n${o}`).join('\n\n');
  const raw = await input.llm.complete([
    { role: 'system', content: PLANNER_SYSTEM },
    {
      role: 'user',
      content: `Question: ${input.query}\nEvidence chunk ids so far: ${input.evidenceChunkIds.join(', ') || '(none)'}\n\n${history || '(no tools yet)'}\n\nChoose the next action.`,
    },
  ]);

  const parsed = parsePlannerResponse(raw);
  if (parsed) return parsed;

  // Fail closed toward finish rather than inventing tools.
  if (input.evidenceChunkIds.length === 0) {
    return {
      thought: 'Planner parse failure',
      action: {
        name: 'finish',
        args: { answer: 'INSUFFICIENT_EVIDENCE: agent planner failed to produce a valid tool call' },
      },
    };
  }
  return mockPlanNext(input);
}

export function formatObservation(tool: string, result: AgentToolResult): string {
  const body =
    result.data !== undefined
      ? `${result.summary}\n${JSON.stringify(result.data).slice(0, 2400)}`
      : result.summary;
  return `Tool ${tool}: ${body}`;
}
