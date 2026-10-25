export type Embedder = {
  model: string;
  dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
};
