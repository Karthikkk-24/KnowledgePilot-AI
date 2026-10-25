import type { RetrievedChunk } from '../ports/chunk-repository';

export function formatEvidenceBlocks(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return 'No evidence passages were retrieved.';
  }

  return chunks
    .map((chunk, index) => {
      const title = chunk.documentTitle ? ` (${chunk.documentTitle})` : '';
      const heading = chunk.headingPath ? `\nSection: ${chunk.headingPath}` : '';
      const page =
        chunk.pageStart != null
          ? `\nPage: ${chunk.pageStart}${chunk.pageEnd != null && chunk.pageEnd !== chunk.pageStart ? `-${chunk.pageEnd}` : ''}`
          : '';
      return `[${index + 1}] chunk:${chunk.id}${title}${heading}${page}\n${chunk.content}`;
    })
    .join('\n\n');
}
