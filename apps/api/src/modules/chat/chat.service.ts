import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { loadEnv } from '@knowledgepilot/config';
import { createDbClient, MessageRole, type Prisma } from '@knowledgepilot/db';
import {
  createAgentLoop,
  createRagOrchestrator,
  defaultPipelineConfig,
  normalizeMetadataFilters,
  type AgentStreamEvent,
  type AnswerPayload,
  type MetadataFilters,
  type RetrievalStrategy,
  type StreamEvent,
} from '@knowledgepilot/rag';
import { createTenantAgentKnowledge } from '../../adapters/agent-knowledge.factory';
import { createEmbedder, createLlmClient, createReranker } from '../../adapters/ai.factory';
import { createPrismaChunkRepository } from '../../adapters/prisma-chunk.repository';

export type ChatMode = 'rag' | 'agent';

export type ChatMessageOptions = {
  retrievalStrategy?: RetrievalStrategy;
  rerankingEnabled?: boolean;
  topK?: number;
  filters?: MetadataFilters;
  mode?: ChatMode;
};

export type ChatStreamEvent = (StreamEvent | AgentStreamEvent) & {
  userMessageId?: string;
  assistantMessageId?: string;
};

@Injectable()
export class ChatService {
  private readonly db = createDbClient();
  private readonly env = loadEnv();
  private readonly embedder = createEmbedder(this.env);
  private readonly llm = createLlmClient(this.env);
  private readonly chunks = createPrismaChunkRepository(this.db);
  private readonly defaultStrategy: RetrievalStrategy = this.env.hybridSearchEnabled
    ? this.env.RAG_RETRIEVAL_STRATEGY
    : 'vector';
  private readonly rag = createRagOrchestrator({
    embedder: this.embedder,
    llm: this.llm,
    chunks: this.chunks,
    reranker: createReranker(this.env),
    defaultConfig: {
      ...defaultPipelineConfig,
      retrievalStrategy: this.defaultStrategy,
      rerankingEnabled: this.env.rerankingEnabled,
      topK: this.env.RAG_DEFAULT_TOP_K,
      abstentionThreshold: this.env.RAG_ABSTENTION_THRESHOLD,
      queryRewriteEnabled: this.env.queryRewriteEnabled,
      multiQueryEnabled: this.env.multiQueryEnabled,
      chunkingStrategy: this.env.parentChildEnabled ? 'parent_child' : 'structure_aware',
    },
    abstentionThreshold: this.env.RAG_ABSTENTION_THRESHOLD,
  });

  agenticEnabled() {
    return this.env.agenticRagEnabled;
  }

  async listConversations(tenantId: string) {
    const rows = await this.db.conversation.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createConversation(tenantId: string, title?: string) {
    const row = await this.db.conversation.create({
      data: {
        tenantId,
        title: title?.trim() || 'New chat',
      },
    });
    return {
      id: row.id,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getConversation(tenantId: string, id: string): Promise<{
    id: string;
    title: string | null;
    createdAt: string;
    updatedAt: string;
    messages: Array<{
      id: string;
      role: MessageRole;
      content: string;
      abstained: boolean;
      diagnostics: unknown;
      createdAt: string;
      citations: Array<{
        chunkId: string;
        documentId: string;
        quote: string;
        page?: number;
      }>;
    }>;
  }> {
    const conversation = await this.db.conversation.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { citations: true },
        },
      },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messages: conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        abstained: message.abstained,
        diagnostics: message.diagnostics,
        createdAt: message.createdAt.toISOString(),
        citations: message.citations.map((citation) => ({
          chunkId: citation.chunkId,
          documentId: citation.documentId,
          quote: citation.quote,
          page: citation.page ?? undefined,
        })),
      })),
    };
  }

  resolveConfig(options?: ChatMessageOptions) {
    let retrievalStrategy = options?.retrievalStrategy ?? this.defaultStrategy;
    if (!this.env.hybridSearchEnabled && retrievalStrategy === 'hybrid') {
      retrievalStrategy = 'vector';
    }

    const rerankingEnabled = options?.rerankingEnabled ?? this.env.rerankingEnabled;

    return {
      retrievalStrategy,
      rerankingEnabled: Boolean(rerankingEnabled),
      topK: options?.topK ?? this.env.RAG_DEFAULT_TOP_K,
    };
  }

  async *streamMessage(
    tenantId: string,
    conversationId: string,
    content: string,
    options?: ChatMessageOptions,
  ): AsyncGenerator<ChatStreamEvent> {
    const conversation = await this.db.conversation.findFirst({
      where: { id: conversationId, tenantId, deletedAt: null },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const mode: ChatMode = options?.mode === 'agent' ? 'agent' : 'rag';
    if (mode === 'agent' && !this.env.agenticRagEnabled) {
      throw new ForbiddenException('Agentic RAG is disabled (FF_AGENTIC_RAG)');
    }

    const userMessage = await this.db.message.create({
      data: {
        tenantId,
        conversationId,
        role: MessageRole.user,
        content: content.trim(),
      },
    });

    if (!conversation.title || conversation.title === 'New chat') {
      await this.db.conversation.update({
        where: { id: conversationId },
        data: { title: content.trim().slice(0, 80) },
      });
    }

    const config = this.resolveConfig(options);
    const filters = normalizeMetadataFilters(options?.filters);

    let finalPayload: AnswerPayload | null = null;

    if (mode === 'agent') {
      const knowledge = createTenantAgentKnowledge({
        db: this.db,
        tenantId,
        chunks: this.chunks,
        embedder: this.embedder,
      });
      const agent = createAgentLoop({
        llm: this.llm,
        knowledge,
        embedder: this.embedder,
        abstentionThreshold: this.env.RAG_ABSTENTION_THRESHOLD,
      });

      for await (const event of agent.answerStream({
        query: content.trim(),
        config: {
          maxSteps: this.env.AGENT_MAX_STEPS,
          timeoutMs: this.env.AGENT_TIMEOUT_MS,
          topK: config.topK,
          retrievalStrategy: config.retrievalStrategy,
          rerankingEnabled: config.rerankingEnabled,
        },
      })) {
        if (event.type === 'done') {
          finalPayload = event.payload;
          continue;
        }
        yield { ...event, userMessageId: userMessage.id };
      }
    } else {
      for await (const event of this.rag.answerStream({
        tenantId,
        query: content.trim(),
        config,
        filters,
      })) {
        if (event.type === 'done') {
          finalPayload = event.payload;
          continue;
        }
        yield { ...event, userMessageId: userMessage.id };
      }
    }

    const payload: AnswerPayload =
      finalPayload ??
      ({
        text: 'Failed to generate an answer.',
        abstained: true,
        abstentionReason: 'pipeline_error',
        citations: [],
        diagnostics: {
          retrievalStrategy: config.retrievalStrategy,
          rerankingEnabled: config.rerankingEnabled,
          queryRewriteEnabled: false,
          multiQueryEnabled: false,
          contextCompressionEnabled: false,
          retrievedChunkIds: [],
          latencyMs: {},
        },
      } satisfies AnswerPayload);

    const assistant = await this.db.message.create({
      data: {
        tenantId,
        conversationId,
        role: MessageRole.assistant,
        content: payload.text,
        abstained: payload.abstained,
        diagnostics: payload.diagnostics as Prisma.InputJsonValue,
        citations: {
          create: payload.citations.map((citation) => ({
            tenantId,
            chunkId: citation.chunkId,
            documentId: citation.documentId,
            quote: citation.quote,
            page: citation.page ?? null,
          })),
        },
      },
    });

    await this.db.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    yield {
      type: 'done',
      payload,
      userMessageId: userMessage.id,
      assistantMessageId: assistant.id,
    };
  }
}
