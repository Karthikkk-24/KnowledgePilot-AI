import { z } from 'zod';

export const citationSchema = z.object({
  chunkId: z.string(),
  documentId: z.string(),
  quote: z.string(),
  page: z.number().optional(),
  documentTitle: z.string().optional(),
});

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  abstained: z.boolean(),
  citations: z.array(citationSchema).default([]),
  createdAt: z.string(),
});

export const conversationSchema = z.object({
  id: z.string(),
  title: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CitationDto = z.infer<typeof citationSchema>;
export type MessageDto = z.infer<typeof messageSchema>;
export type ConversationDto = z.infer<typeof conversationSchema>;
