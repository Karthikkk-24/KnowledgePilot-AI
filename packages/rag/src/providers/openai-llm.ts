import type { LlmClient, LlmMessage } from '../ports/llm-client';

type OpenAILlmOptions = {
  apiKey: string;
  model: string;
  baseUrl: string;
};

export function createOpenAILlmClient(options: OpenAILlmOptions): LlmClient {
  const endpoint = `${options.baseUrl.replace(/\/$/, '')}/chat/completions`;

  return {
    model: options.model,
    async complete(messages: LlmMessage[]) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model,
          messages,
          temperature: 0.2,
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`LLM provider error (${response.status}): ${body.slice(0, 300)}`);
      }
      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return json.choices?.[0]?.message?.content?.trim() ?? '';
    },

    async *stream(messages: LlmMessage[]) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model,
          messages,
          temperature: 0.2,
          stream: true,
        }),
      });
      if (!response.ok || !response.body) {
        const body = await response.text();
        throw new Error(`LLM stream error (${response.status}): ${body.slice(0, 300)}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) {
            continue;
          }
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') {
            return;
          }
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              yield token;
            }
          } catch {
            // ignore malformed SSE chunks
          }
        }
      }
    },
  };
}
