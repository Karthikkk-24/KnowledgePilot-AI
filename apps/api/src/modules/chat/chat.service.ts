import { Injectable, NotFoundException } from '@nestjs/common';
import { loadEnv } from '@knowledgepilot/config';
import { createDbClient, MessageRole, STUB_TENANT_ID } from '@knowledgepilot/db';
import {
  createRagOrchestrator,
  defaultPipelineConfig,
  type AnswerPayload,
  type StreamEvent,
} from '@knowledgepilot/rag';
import { createEmbedder, createLlmClient } from '../../adapters/ai.factory';
import { createPrismaChunkRepository } from '../../adapters/prisma-chunk.repository';

@Injectable()
export class ChatService {
  private readonly db = createDbClient();
  private readonly env = loadEnv();
  private readonly rag = createRagOrchestrator({
    embedder: createEmbedder(this.env),
    llm: createLlmClient(this.env),
    chunks: createPrismaChunkRepository(this.db),
    defaultConfig: {
      ...defaultPipelineConfig,
      topK: this.env.RAG_DEFAULT_TOP_K,
    },
    abstentionThreshold: this.env.RAG_ABSTENTION_THRESHOLD,
  });

  async listConversations() {
    const rows = await this.db.conversation.findMany({
      where: { tenantId: STUB_TENANT_ID, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createConversation(title?: string) {
    const row = await this.db.conversation.create({
      data: {
        tenantId: STUB_TENANT_ID,
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

  async getConversation(id: string): Promise<{
    id: string;
    title: string | null;
    createdAt: string;
    updatedAt: string;
    messages: Array<{
      id: string;
      role: MessageRole;
      content: string;
      abstained: boolean;
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
      where: { id, tenantId: STUB_TENANT_ID, deletedAt: null },
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

  async *streamMessage(conversationId: string, content: string): AsyncGenerator<StreamEvent & { userMessageId?: string; assistantMessageId?: string }> {
    const conversation = await this.db.conversation.findFirst({
      where: { id: conversationId, tenantId: STUB_TENANT_ID, deletedAt: null },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const userMessage = await this.db.message.create({
      data: {
        tenantId: STUB_TENANT_ID,
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

    let finalPayload: AnswerPayload | null = null;
    for await (const event of this.rag.answerStream({
      tenantId: STUB_TENANT_ID,
      query: content.trim(),
    })) {
      if (event.type === 'done') {
        finalPayload = event.payload;
        continue;
      }
      yield { ...event, userMessageId: userMessage.id };
    }

    if (!finalPayload) {
      finalPayload = {
        text: 'Failed to generate an answer.',
        abstained: true,
        abstentionReason: 'pipeline_error',
        citations: [],
        diagnostics: { retrievedChunkIds: [], latencyMs: {} },
      };
    }

    const assistant = await this.db.message.create({
      data: {
        tenantId: STUB_TENANT_ID,
        conversationId,
        role: MessageRole.assistant,
        content: finalPayload.text,
        abstained: finalPayload.abstained,
        citations: {
          create: finalPayload.citations.map((citation) => ({
            tenantId: STUB_TENANT_ID,
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
      payload: finalPayload,
      userMessageId: userMessage.id,
      assistantMessageId: assistant.id,
    };
  }
}
