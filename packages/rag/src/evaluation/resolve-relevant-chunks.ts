export type PassageChunk = {
  id: string;
  documentId: string;
  content: string;
};

/**
 * Resolve golden passages to chunk ids by case-insensitive substring match.
 * Used when benchmark items store passages instead of frozen chunk ids.
 */
export function resolveRelevantChunkIds(
  passages: string[],
  chunks: PassageChunk[],
): string[] {
  const ids = new Set<string>();
  for (const passage of passages) {
    const needle = passage.trim().toLowerCase();
    if (!needle) continue;
    for (const chunk of chunks) {
      if (chunk.content.toLowerCase().includes(needle)) {
        ids.add(chunk.id);
      }
    }
  }
  return [...ids];
}
