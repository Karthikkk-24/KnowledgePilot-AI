'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  api,
  streamChatMessage,
  type AnswerDiagnostics,
  type AnswerCitation,
  type RetrievalStrategy,
} from '../../lib/api';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  abstained?: boolean;
  abstentionReason?: string;
  citations?: AnswerCitation[];
  diagnostics?: AnswerDiagnostics;
};

const STRATEGY_OPTIONS: Array<{ value: RetrievalStrategy; label: string }> = [
  { value: 'hybrid', label: 'Hybrid (vector + keyword)' },
  { value: 'vector', label: 'Vector only' },
  { value: 'keyword', label: 'Keyword / FTS' },
];

export default function ChatPage() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<RetrievalStrategy>('hybrid');
  const [rerankingEnabled, setRerankingEnabled] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [documents, setDocuments] = useState<
    Array<{ id: string; title: string; mimeType: string; status: string }>
  >([]);
  const [liveDiagnostics, setLiveDiagnostics] = useState<AnswerDiagnostics | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [existing, docs] = await Promise.all([
          api.listConversations(),
          api.listDocuments(),
        ]);
        setDocuments(
          docs
            .filter((d) => d.status === 'ready')
            .map((d) => ({
              id: d.id,
              title: d.title,
              mimeType: d.mimeType,
              status: d.status,
            })),
        );
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

  function toggleDocument(id: string) {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function onSend() {
    if (!conversationId || !input.trim() || streaming) return;
    const question = input.trim();
    setInput('');
    setError(null);
    setStreaming(true);
    setLiveDiagnostics(null);

    const userId = `local-user-${Date.now()}`;
    const assistantId = `local-assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', content: question },
      { id: assistantId, role: 'assistant', content: '', citations: [] },
    ]);

    let assembled = '';

    try {
      await streamChatMessage(
        conversationId,
        question,
        {
          onToken: (text) => {
            assembled += text;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: assembled } : m)),
            );
          },
          onCitation: () => {
            // citations arrive again on done with full payload
          },
          onDiagnostics: (diagnostics) => setLiveDiagnostics(diagnostics),
          onDone: (payload) => {
            setLiveDiagnostics(payload.diagnostics);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: payload.text,
                      abstained: payload.abstained,
                      abstentionReason: payload.abstentionReason,
                      citations: payload.citations,
                      diagnostics: payload.diagnostics,
                    }
                  : m,
              ),
            );
          },
          onError: (message) => setError(message),
        },
        {
          retrievalStrategy: strategy,
          rerankingEnabled,
          filters:
            selectedDocIds.length > 0 ? { documentIds: selectedDocIds } : undefined,
        },
      );
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
          Hybrid retrieval by default. Try an exact error code with hybrid vs vector, or a nonsense
          question to see abstention.
        </p>
      </div>

      <section
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: '1rem',
          display: 'grid',
          gap: '0.85rem',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 4, fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--muted)' }}>Retrieval strategy</span>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as RetrievalStrategy)}
              style={{
                borderRadius: 10,
                border: '1px solid var(--line)',
                padding: '0.55rem 0.7rem',
                background: '#fff',
              }}
            >
              {STRATEGY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '0.9rem',
              paddingBottom: 6,
            }}
          >
            <input
              type="checkbox"
              checked={rerankingEnabled}
              onChange={(e) => setRerankingEnabled(e.target.checked)}
            />
            Rerank candidates
          </label>
        </div>

        {documents.length > 0 ? (
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 6 }}>
              Filter by document (optional)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
              {documents.map((doc) => {
                const active = selectedDocIds.includes(doc.id);
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => toggleDocument(doc.id)}
                    style={{
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                      background: active ? '#e0f2fe' : '#fff',
                      color: active ? 'var(--accent)' : 'inherit',
                      borderRadius: 999,
                      padding: '0.25rem 0.7rem',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    {doc.title}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {liveDiagnostics ? (
          <details style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            <summary>Retrieval diagnostics</summary>
            <pre style={{ whiteSpace: 'pre-wrap', margin: '0.5rem 0 0' }}>
              {JSON.stringify(liveDiagnostics, null, 2)}
            </pre>
          </details>
        ) : null}
      </section>

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
                background:
                  message.role === 'user'
                    ? '#dbeafe'
                    : message.abstained
                      ? '#fff7ed'
                      : '#f5f5f4',
                border:
                  message.abstained && message.role === 'assistant'
                    ? '1px solid #fdba74'
                    : '1px solid transparent',
                borderRadius: 12,
                padding: '0.75rem 0.9rem',
                whiteSpace: 'pre-wrap',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4 }}>
                {message.role}
                {message.abstained ? ' · insufficient evidence' : ''}
                {message.diagnostics?.retrievalStrategy
                  ? ` · ${message.diagnostics.retrievalStrategy}`
                  : ''}
                {message.diagnostics?.rerankingEnabled ? ' · reranked' : ''}
              </div>
              {message.abstained ? (
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Could not answer from documents</div>
              ) : null}
              <div>{message.content || (streaming ? '…' : '')}</div>
              {message.abstained && message.abstentionReason ? (
                <div style={{ fontSize: '0.8rem', color: '#9a3412', marginTop: 6 }}>
                  Reason: {message.abstentionReason}
                </div>
              ) : null}
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
                      {citation.documentTitle || 'source'}
                      {citation.page ? ` · p.${citation.page}` : ''}
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
