export function toPgVectorLiteral(values: number[]): string {
  if (values.length === 0) {
    throw new Error('Embedding vector must not be empty');
  }
  return `[${values.join(',')}]`;
}

export function formatEmbeddingForInsert(values: number[]): string {
  return toPgVectorLiteral(values);
}
