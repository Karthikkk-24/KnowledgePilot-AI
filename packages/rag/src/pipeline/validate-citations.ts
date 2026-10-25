const CITATION_RE = /\[chunk:([a-zA-Z0-9_-]+)\]/g;

export type ParsedCitation = {
  chunkId: string;
};

export function parseCitationIds(text: string): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(CITATION_RE)) {
    const id = match[1];
    if (id) {
      ids.add(id);
    }
  }
  return [...ids];
}

export function validateCitations(
  text: string,
  retrievedChunkIds: string[],
): { validIds: string[]; invalidIds: string[]; citations: ParsedCitation[] } {
  const allowed = new Set(retrievedChunkIds);
  const parsed = parseCitationIds(text);
  const validIds = parsed.filter((id) => allowed.has(id));
  const invalidIds = parsed.filter((id) => !allowed.has(id));
  return {
    validIds,
    invalidIds,
    citations: validIds.map((chunkId) => ({ chunkId })),
  };
}

export function isAbstentionResponse(text: string): boolean {
  return text.trim().toUpperCase().startsWith('INSUFFICIENT_EVIDENCE');
}
