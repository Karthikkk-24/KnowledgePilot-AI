import type { Embedder } from '../ports/embedder';

type OpenAIEmbedderOptions = {
  apiKey: string;
  model: string;
  dimensions: number;
  baseUrl: string;
};

export function createOpenAIEmbedder(options: OpenAIEmbedderOptions): Embedder {
  return {
    model: options.model,
    dimensions: options.dimensions,
    async embed(texts: string[]) {
      if (texts.length === 0) {
        return [];
      }
      const response = await fetch(`${options.baseUrl.replace(/\/$/, '')}/embeddings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model,
          input: texts,
          dimensions: options.dimensions,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Embedding provider error (${response.status}): ${body.slice(0, 300)}`);
      }

      const json = (await response.json()) as {
        data?: Array<{ embedding: number[]; index: number }>;
      };
      const rows = [...(json.data ?? [])].sort((a, b) => a.index - b.index);
      return rows.map((row) => row.embedding);
    },
  };
}
