import type { Embedder } from '../ports/embedder';
import type { LlmClient } from '../ports/llm-client';
import type { RetrievedChunk } from '../ports/chunk-repository';
import { formatEvidenceBlocks } from '../prompting/format-evidence';
import { GROUNDED_SYSTEM_PROMPT } from '../prompting/grounded-system-prompt';
import { isAbstentionResponse, validateCitations } from '../pipeline/validate-citations';
import type { AnswerCitation } from '../pipeline/orchestrator';
import { formatObservation, planNextAction } from './planner';
import type { AgentKnowledgeAccess } from './knowledge';
import { executeAgentTool } from './tools';
import {
  defaultAgentConfig,
  type AgentAnswerDiagnostics,
  type AgentAnswerPayload,
  type AgentConfig,
  type AgentStreamEvent,
  type AgentTraceStep,
} from './types';

export type AgentLoopDeps = {
  llm: LlmClient;
  knowledge: AgentKnowledgeAccess;
  embedder?: Embedder;
  abstentionThreshold: number;
};

function buildCitations(validIds: string[], byId: Map<string, RetrievedChunk>): AnswerCitation[] {
  return validIds.flatMap((id) => {
    const chunk = byId.get(id);
    if (!chunk) return [];
    return [
      {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        page: chunk.pageStart ?? undefined,
        quote: chunk.content.slice(0, 280),
        documentTitle: chunk.documentTitle,
      },
    ];
  });
}

function mergeConfig(partial?: Partial<AgentConfig>): AgentConfig {
  return { ...defaultAgentConfig, ...partial };
}

async function synthesizeFinalAnswer(
  llm: LlmClient,
  query: string,
  evidence: RetrievedChunk[],
): Promise<string> {
  if (evidence.length === 0) {
    return 'INSUFFICIENT_EVIDENCE: no supporting passages were retrieved';
  }
  if (llm.model.startsWith('mock')) {
    const ids = evidence
      .slice(0, 3)
      .map((c) => `[chunk:${c.id}]`)
      .join(' ');
    return `Based on the retrieved knowledge for “${query}”. ${ids}`;
  }
  const evidenceText = formatEvidenceBlocks(evidence);
  return llm.complete([
    { role: 'system', content: GROUNDED_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${evidenceText}\n\nQuestion: ${query}`,
    },
  ]);
}

export function createAgentLoop(deps: AgentLoopDeps) {
  async function* answerStream(input: {
    query: string;
    config?: Partial<AgentConfig>;
  }): AsyncGenerator<AgentStreamEvent> {
    const config = mergeConfig(input.config);
    const startedAt = Date.now();
    const steps: AgentTraceStep[] = [];
    const observations: string[] = [];
    const evidenceById = new Map<string, RetrievedChunk>();
    let timedOut = false;
    let maxStepsHit = false;

    const runtime = {
      knowledge: deps.knowledge,
      topK: config.topK,
      retrievalStrategy: config.retrievalStrategy,
    };

    try {
      for (let step = 0; step < config.maxSteps; step += 1) {
        if (Date.now() - startedAt > config.timeoutMs) {
          timedOut = true;
          break;
        }

        const planned = await planNextAction({
          llm: deps.llm,
          query: input.query,
          step,
          observations,
          evidenceChunkIds: [...evidenceById.keys()],
        });

        const toolStarted = Date.now();
        const result = await executeAgentTool(planned.action, runtime);
        const latencyMs = Date.now() - toolStarted;

        if (planned.action.name === 'search_knowledge' && result.ok && result.data) {
          const hits = (result.data as { hits?: RetrievedChunk[] }).hits ?? [];
          for (const hit of hits) {
            if (!evidenceById.has(hit.id)) evidenceById.set(hit.id, hit);
          }
        }
        if (planned.action.name === 'get_chunk' && result.ok && result.data) {
          const chunk = result.data as RetrievedChunk;
          if (chunk.id) evidenceById.set(chunk.id, chunk);
        }

        const trace: AgentTraceStep = {
          step: step + 1,
          thought: planned.thought,
          tool: planned.action.name,
          args: planned.action.args,
          resultSummary: result.summary,
          latencyMs,
          chunkIds: result.chunkIds,
        };
        steps.push(trace);
        yield { type: 'agent_step', step: trace };

        observations.push(formatObservation(planned.action.name, result));

        if (planned.action.name === 'finish') {
          const rawAnswer =
            typeof planned.action.args.answer === 'string'
              ? planned.action.args.answer
              : await synthesizeFinalAnswer(deps.llm, input.query, [...evidenceById.values()]);

          const payload = finalizeAgentAnswer({
            rawText: rawAnswer,
            evidenceById,
            steps,
            config,
            timedOut,
            maxStepsHit: false,
          });

          for (const citation of payload.citations) {
            yield { type: 'citation', citation };
          }
          yield { type: 'diagnostics', diagnostics: payload.diagnostics };
          for (const part of payload.text.match(/.{1,40}/g) ?? [payload.text]) {
            yield { type: 'token', text: part };
          }
          yield { type: 'done', payload };
          return;
        }
      }

      maxStepsHit = !timedOut;
      const rawAnswer = await synthesizeFinalAnswer(
        deps.llm,
        input.query,
        [...evidenceById.values()],
      );
      const payload = finalizeAgentAnswer({
        rawText: rawAnswer,
        evidenceById,
        steps,
        config,
        timedOut,
        maxStepsHit,
      });
      for (const citation of payload.citations) {
        yield { type: 'citation', citation };
      }
      yield { type: 'diagnostics', diagnostics: payload.diagnostics };
      for (const part of payload.text.match(/.{1,40}/g) ?? [payload.text]) {
        yield { type: 'token', text: part };
      }
      yield { type: 'done', payload };
    } catch (error) {
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : 'Agent loop failed',
      };
    }
  }

  async function answer(input: {
    query: string;
    config?: Partial<AgentConfig>;
  }): Promise<AgentAnswerPayload> {
    let final: AgentAnswerPayload | null = null;
    for await (const event of answerStream(input)) {
      if (event.type === 'done') final = event.payload;
      if (event.type === 'error') {
        throw new Error(event.message);
      }
    }
    if (!final) {
      throw new Error('Agent produced no answer');
    }
    return final;
  }

  return { answer, answerStream };
}

function finalizeAgentAnswer(input: {
  rawText: string;
  evidenceById: Map<string, RetrievedChunk>;
  steps: AgentTraceStep[];
  config: AgentConfig;
  timedOut: boolean;
  maxStepsHit: boolean;
}): AgentAnswerPayload {
  const evidenceIds = [...input.evidenceById.keys()];
  const latencyMs: Record<string, number> = {
    agentTotal: input.steps.reduce((sum, s) => sum + s.latencyMs, 0),
  };

  const baseDiagnostics: AgentAnswerDiagnostics = {
    retrievalStrategy: input.config.retrievalStrategy,
    rerankingEnabled: Boolean(input.config.rerankingEnabled),
    queryRewriteEnabled: false,
    multiQueryEnabled: false,
    contextCompressionEnabled: false,
    retrievedChunkIds: evidenceIds,
    latencyMs,
    agentMode: true,
    agentSteps: input.steps,
    agentStepCount: input.steps.length,
    agentTimedOut: input.timedOut,
    agentMaxStepsHit: input.maxStepsHit,
  };

  if (isAbstentionResponse(input.rawText) || evidenceIds.length === 0) {
    return {
      text: input.rawText.startsWith('INSUFFICIENT_EVIDENCE')
        ? input.rawText
        : 'INSUFFICIENT_EVIDENCE: no supporting passages were retrieved',
      abstained: true,
      abstentionReason: evidenceIds.length === 0 ? 'empty_retrieval' : 'model_abstain',
      citations: [],
      diagnostics: baseDiagnostics,
    };
  }

  const validation = validateCitations(input.rawText, evidenceIds);
  if (validation.validIds.length === 0) {
    return {
      text: 'INSUFFICIENT_EVIDENCE: answer lacked valid citations against retrieved evidence',
      abstained: true,
      abstentionReason: 'citation_validation_failed',
      citations: [],
      diagnostics: {
        ...baseDiagnostics,
        invalidCitationIds: validation.invalidIds,
      },
    };
  }

  return {
    text: validation.cleanedText,
    abstained: false,
    citations: buildCitations(validation.validIds, input.evidenceById),
    diagnostics: {
      ...baseDiagnostics,
      invalidCitationIds:
        validation.invalidIds.length > 0 ? validation.invalidIds : undefined,
    },
  };
}

export type AgentLoop = ReturnType<typeof createAgentLoop>;
