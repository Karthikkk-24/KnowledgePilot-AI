export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LlmClient = {
  model: string;
  complete(messages: LlmMessage[]): Promise<string>;
  stream(messages: LlmMessage[]): AsyncIterable<string>;
};
