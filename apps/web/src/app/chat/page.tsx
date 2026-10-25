'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, streamChatMessage } from '../../lib/api';

type Citation = {
  chunkId: string;
  documentId: string;
  quote: string;
  page?: number;
  documentTitle?: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  abstained?: boolean;
  citations?: Citation[];
};

export default function ChatPage() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const existing = await api.listConversations();
        const conversation = existing[0] ?? (await api.createConversation());
        setConversationId(conversation.id);
        if (existing[0]) {
          const full = await api.getConversation(conversation.id);
          setMessages(
            full.messages.flatMap((m) => {
              if (m.role !== 'user' && m.role !== 'assistant') {
                return [];
              }
              return [
                {
                  id: m.id,
                  role: m.role,
                  content: m.content,
                  abstained: m.abstained,
                  citations: m.citations,
                } satisfies ChatMessage,
              ];
            }),
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start chat');
      }
    })();
  }, []);

  const canSend = useMemo(
    () => Boolean(conversationId && input.trim() && !streaming),
    [conversationId, input, streaming],
  );

  async function onSend() {
    if (!conversationId || !input.trim() || streaming) return;
    const question = input.trim();
    setInput('');
    setError(null);
    setStreaming(true);

    const userId = `local-user-${Date.now()}`;
    const assistantId = `local-assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', content: question },
      { id: assistantId, role: 'assistant', content: '', citations: [] },
    ]);

    let assembled = '';
    const citations: Citation[] = [];

    try {
      await streamChatMessage(conversationId, question, {
        onToken: (text) => {
          assembled += text;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: assembled } : m)),
          );
        },
        onCitation: (citation) => {
          citations.push(citation);
        },
        onDone: (payload) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: payload.text,
                    abstained: payload.abstained,
                    citations: payload.citations,
                  }
                : m,
            ),
          );
        },
        onError: (message) => setError(message),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat failed');
    } finally {
      setStreaming(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 960,
        margin: '0 auto',
        padding: '2rem 1.5rem 4rem',
        display: 'grid',
        gap: '1rem',
        minHeight: 'calc(100vh - 72px)',
      }}
    >
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Chat</h1>
        <p style={{ color: 'var(--muted)', margin: '0.4rem 0 0' }}>
          Answers are grounded in retrieved passages. Citations open source previews.
        </p>
      </div>

      <div
        style={{
          flex: 1,
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: '1rem',
          display: 'grid',
          gap: '0.85rem',
          alignContent: 'start',
          minHeight: 420,
        }}
      >
        {messages.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Ask a question about your uploaded documents.</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              style={{
                justifySelf: message.role === 'user' ? 'end' : 'start',
                maxWidth: '85%',
                background: message.role === 'user' ? '#dbeafe' : message.abstained ? '#fff7ed' : '#f5f5f4',
                borderRadius: 12,
                padding: '0.75rem 0.9rem',
                whiteSpace: 'pre-wrap',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4 }}>
                {message.role}
                {message.abstained ? ' · insufficient evidence' : ''}
              </div>
              <div>{message.content || (streaming ? '…' : '')}</div>
              {message.citations && message.citations.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.6rem' }}>
                  {message.citations.map((citation) => (
                    <Link
                      key={citation.chunkId}
                      href={`/sources/${citation.chunkId}`}
                      style={{
                        fontSize: '0.8rem',
                        textDecoration: 'none',
                        border: '1px solid var(--line)',
                        borderRadius: 999,
                        padding: '0.15rem 0.55rem',
                        background: '#fff',
                        color: 'var(--accent)',
                      }}
                      title={citation.quote}
                    >
                      {citation.documentTitle || 'source'} {citation.page ? `p.${citation.page}` : ''}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {error ? <p style={{ color: '#b91c1c', margin: 0 }}>{error}</p> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSend();
        }}
        style={{ display: 'flex', gap: '0.75rem' }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your documents…"
          style={{
            flex: 1,
            borderRadius: 12,
            border: '1px solid var(--line)',
            padding: '0.85rem 1rem',
            fontSize: '1rem',
          }}
        />
        <button
          type="submit"
          disabled={!canSend}
          style={{
            border: 0,
            borderRadius: 12,
            padding: '0.85rem 1.2rem',
            background: canSend ? 'var(--accent)' : '#a8a29e',
            color: '#fff',
          }}
        >
          {streaming ? 'Thinking…' : 'Send'}
        </button>
      </form>
    </main>
  );
}
