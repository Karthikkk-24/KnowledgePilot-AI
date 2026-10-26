import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { MetadataFilters, RetrievalStrategy } from '@knowledgepilot/rag';
import { ok } from '../../common/http';
import { ChatService } from './chat.service';

type PostMessageBody = {
  content?: string;
  retrievalStrategy?: RetrievalStrategy;
  rerankingEnabled?: boolean;
  topK?: number;
  filters?: MetadataFilters;
};

@Controller('conversations')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  async list() {
    return ok(await this.chatService.listConversations());
  }

  @Post()
  async create(@Body() body: { title?: string }) {
    return ok(await this.chatService.createConversation(body?.title));
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<ReturnType<typeof ok>> {
    return ok(await this.chatService.getConversation(id));
  }

  @Post(':id/messages')
  async postMessage(
    @Param('id') id: string,
    @Body() body: PostMessageBody,
    @Res() res: Response,
  ) {
    const content = body?.content?.trim();
    if (!content) {
      res.status(400).json({
        data: null,
        error: { code: 'BAD_REQUEST', message: 'content is required', details: {} },
        meta: { requestId: 'chat' },
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
        meta: { requestId: 'chat' },
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const write = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      for await (const event of this.chatService.streamMessage(id, content, {
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
