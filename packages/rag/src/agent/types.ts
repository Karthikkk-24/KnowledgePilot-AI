import type { AnswerCitation, AnswerDiagnostics, AnswerPayload } from '../pipeline/orchestrator';
import type { RetrievalStrategy } from '../types';

export const AGENT_TOOL_NAMES = [
  'search_knowledge',
  'get_chunk',
  'list_documents',
  'finish',
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export type AgentToolCall = {
  name: Exclude<AgentToolName, 'finish'>;
  args: Record<string, unknown>;
};

export type AgentFinishAction = {
  name: 'finish';
  args: { answer: string };
};

export type AgentAction = AgentToolCall | AgentFinishAction;

export type AgentToolResult = {
  ok: boolean;
  summary: string;
  /** Opaque payload for the planner; never exposed cross-tenant. */
  data?: unknown;
  chunkIds?: string[];
};

export type AgentTraceStep = {
  step: number;
  thought?: string;
  tool: AgentToolName;
  args: Record<string, unknown>;
  resultSummary: string;
  latencyMs: number;
  chunkIds?: string[];
};

export type AgentConfig = {
  maxSteps: number;
  timeoutMs: number;
  topK: number;
  retrievalStrategy: RetrievalStrategy;
  rerankingEnabled?: boolean;
};

export const defaultAgentConfig: AgentConfig = {
  maxSteps: 5,
  timeoutMs: 30_000,
  topK: 6,
  retrievalStrategy: 'hybrid',
  rerankingEnabled: false,
};

export type AgentAnswerDiagnostics = AnswerDiagnostics & {
  agentMode: true;
  agentSteps: AgentTraceStep[];
  agentStepCount: number;
  agentTimedOut: boolean;
  agentMaxStepsHit: boolean;
};

export type AgentAnswerPayload = AnswerPayload & {
  diagnostics: AgentAnswerDiagnostics;
  citations: AnswerCitation[];
};

export type AgentStreamEvent =
  | { type: 'agent_step'; step: AgentTraceStep }
  | { type: 'token'; text: string }
  | { type: 'citation'; citation: AnswerCitation }
  | { type: 'diagnostics'; diagnostics: AgentAnswerDiagnostics }
  | { type: 'done'; payload: AgentAnswerPayload }
  | { type: 'error'; message: string };
