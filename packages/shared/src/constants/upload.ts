export const UPLOAD_ALLOWED_MIME = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/html',
  'application/octet-stream',
] as const;

export const UPLOAD_ALLOWED_EXTENSIONS = [
  '.pdf',
  '.txt',
  '.md',
  '.markdown',
  '.html',
  '.htm',
] as const;

export const CHUNKING_STRATEGIES = [
  'fixed',
  'structure_aware',
  'parent_child',
] as const;

export type ChunkingStrategyName = (typeof CHUNKING_STRATEGIES)[number];
