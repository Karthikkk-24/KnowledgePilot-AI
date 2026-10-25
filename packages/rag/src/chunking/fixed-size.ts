export type TextChunk = {
  content: string;
  charStart: number;
  charEnd: number;
  headingPath?: string;
  pageStart?: number;
  pageEnd?: number;
};

export function chunkFixedSize(
  text: string,
  options: { chunkSize: number; overlap: number; headingPath?: string },
): TextChunk[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const { chunkSize, overlap, headingPath } = options;
  if (chunkSize <= 0) {
    throw new Error('chunkSize must be positive');
  }
  if (overlap < 0 || overlap >= chunkSize) {
    throw new Error('overlap must be >= 0 and < chunkSize');
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const content = normalized.slice(start, end).trim();
    if (content) {
      chunks.push({
        content,
        charStart: start,
        charEnd: end,
        headingPath,
      });
    }
    if (end >= normalized.length) {
      break;
    }
    start = end - overlap;
  }
  return chunks;
}
