export const RETRIEVAL_STRATEGIES = ['vector', 'keyword', 'hybrid'] as const;
export type RetrievalStrategyName = (typeof RETRIEVAL_STRATEGIES)[number];

export const CHAT_MODES = ['rag', 'agent'] as const;
export type ChatModeName = (typeof CHAT_MODES)[number];

export const AGENT_TOOL_NAMES = [
  'search_knowledge',
  'get_chunk',
  'list_documents',
  'finish',
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

/** Parent chunk size floor when deriving from child size. */
export const PARENT_CHILD_MIN_PARENT_SIZE = 1200;

/** UI/pipeline defaults mirrored by `@knowledgepilot/config` CONFIG_DEFAULTS.rag. */
export const RAG_DEFAULTS = {
  topK: 8,
  rerankTopN: 5,
  candidateMultiplier: 4,
  chunkSize: 800,
  chunkOverlap: 120,
  abstentionThreshold: 0.15,
  rrfK: 60,
} as const;

/** Agentic loop defaults mirrored by `@knowledgepilot/config` CONFIG_DEFAULTS.agent. */
export const AGENT_DEFAULTS = {
  maxSteps: 5,
  timeoutMs: 30_000,
  maxStepsCap: 12,
  timeoutMsCap: 120_000,
} as const;
