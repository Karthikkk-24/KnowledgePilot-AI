/** Rough token estimate without pulling a tokenizer dependency. */
export function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}
