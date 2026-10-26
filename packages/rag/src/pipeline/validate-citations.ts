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

export function stripInvalidCitations(text: string, invalidIds: string[]): string {
  let cleaned = text;
  for (const id of invalidIds) {
    cleaned = cleaned.replaceAll(`[chunk:${id}]`, '');
  }
  return cleaned.replace(/[ \t]{2,}/g, ' ').trim();
}

export function validateCitations(
  text: string,
  retrievedChunkIds: string[],
): {
  validIds: string[];
  invalidIds: string[];
  citations: ParsedCitation[];
  cleanedText: string;
} {
  const allowed = new Set(retrievedChunkIds);
  const parsed = parseCitationIds(text);
  const validIds = parsed.filter((id) => allowed.has(id));
  const invalidIds = parsed.filter((id) => !allowed.has(id));
  return {
    validIds,
    invalidIds,
    citations: validIds.map((chunkId) => ({ chunkId })),
    cleanedText: stripInvalidCitations(text, invalidIds),
  };
}

export function isAbstentionResponse(text: string): boolean {
  return text.trim().toUpperCase().startsWith('INSUFFICIENT_EVIDENCE');
}
