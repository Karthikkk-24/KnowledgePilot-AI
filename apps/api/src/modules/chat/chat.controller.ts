import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { MembershipRole } from '@knowledgepilot/db';
import type { MetadataFilters, RetrievalStrategy } from '@knowledgepilot/rag';
import { loadEnv } from '@knowledgepilot/config';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { MinRole } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import type { AuthPrincipal } from '../../auth/auth.types';
import { ok } from '../../common/http';
import { ChatService } from './chat.service';

const env = loadEnv();

type PostMessageBody = {
  content?: string;
  retrievalStrategy?: RetrievalStrategy;
  rerankingEnabled?: boolean;
  topK?: number;
  filters?: MetadataFilters;
};

@Controller('conversations')
@UseGuards(AuthGuard, RolesGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  async list(@CurrentAuth() auth: AuthPrincipal) {
    return ok(await this.chatService.listConversations(auth.tenantId));
  }

  @Post()
  @MinRole(MembershipRole.member)
  async create(@CurrentAuth() auth: AuthPrincipal, @Body() body: { title?: string }) {
    return ok(await this.chatService.createConversation(auth.tenantId, body?.title));
  }

  @Get(':id')
  async get(@CurrentAuth() auth: AuthPrincipal, @Param('id') id: string): Promise<ReturnType<typeof ok>> {
    return ok(await this.chatService.getConversation(auth.tenantId, id));
  }

  @Post(':id/messages')
  @MinRole(MembershipRole.member)
  @Throttle({ default: { limit: env.RATE_LIMIT_CHAT_LIMIT, ttl: env.RATE_LIMIT_TTL_MS } })
  async postMessage(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id') id: string,
    @Body() body: PostMessageBody,
    @Res() res: Response,
  ) {
    const content = body?.content?.trim();
    if (!content) {
      res.status(400).json({
        data: null,
        error: { code: 'BAD_REQUEST', message: 'content is required', details: {} },
        meta: { requestId: auth.requestId },
      });
      return;
    }

    const allowedStrategies = new Set(['vector', 'keyword', 'hybrid']);
    if (body.retrievalStrategy && !allowedStrategies.has(body.retrievalStrategy)) {
      res.status(400).json({
        data: null,
        error: {
          code: 'BAD_REQUEST',
          message: 'retrievalStrategy must be vector, keyword, or hybrid',
          details: {},
        },
        meta: { requestId: auth.requestId },
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('x-request-id', auth.requestId);
    res.flushHeaders?.();

    const write = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      for await (const event of this.chatService.streamMessage(auth.tenantId, id, content, {
        retrievalStrategy: body.retrievalStrategy,
        rerankingEnabled: body.rerankingEnabled,
        topK: body.topK,
        filters: body.filters,
      })) {
        if (event.type === 'token') {
          write('token', { text: event.text });
        } else if (event.type === 'citation') {
          write('citation', { citation: event.citation });
        } else if (event.type === 'diagnostics') {
          write('diagnostics', { diagnostics: event.diagnostics });
        } else if (event.type === 'error') {
          write('error', { message: event.message });
        } else if (event.type === 'done') {
          write('done', {
            payload: event.payload,
            userMessageId: event.userMessageId,
            assistantMessageId: event.assistantMessageId,
          });
        }
      }
    } catch (error) {
      write('error', {
        message: error instanceof Error ? error.message : 'Chat stream failed',
      });
    } finally {
      res.end();
    }
  }
}
