import { z } from 'zod';

export const documentStatusSchema = z.enum([
  'pending',
  'queued',
  'processing',
  'ready',
  'failed',
]);

export const documentSchema = z.object({
  id: z.string(),
  title: z.string(),
  originalFilename: z.string(),
  mimeType: z.string(),
  byteSize: z.number(),
  status: documentStatusSchema,
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type DocumentDto = z.infer<typeof documentSchema>;
