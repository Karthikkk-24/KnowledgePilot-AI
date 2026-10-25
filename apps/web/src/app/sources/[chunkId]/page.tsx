'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../lib/api';

export default function SourcePreviewPage() {
  const params = useParams<{ chunkId: string }>();
  const chunkId = params.chunkId;
  const [chunk, setChunk] = useState<Awaited<ReturnType<typeof api.getChunk>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chunkId) return;
    void api
      .getChunk(chunkId)
      .then(setChunk)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load source'));
  }, [chunkId]);

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <Link href="/chat" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
        ← Back to chat
      </Link>
      <h1 style={{ fontFamily: 'var(--font-display)', marginBottom: '0.35rem' }}>Source preview</h1>
      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
      {!chunk && !error ? <p style={{ color: 'var(--muted)' }}>Loading…</p> : null}
      {chunk ? (
        <article
          style={{
            marginTop: '1rem',
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 16,
            padding: '1.25rem',
          }}
        >
          <h2 style={{ marginTop: 0 }}>{chunk.document.title}</h2>
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>
            {chunk.document.originalFilename}
            {chunk.headingPath ? ` · ${chunk.headingPath}` : ''}
            {chunk.pageStart != null ? ` · page ${chunk.pageStart}` : ''}
          </p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'var(--font-body)',
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            {chunk.content}
          </pre>
        </article>
      ) : null}
    </main>
  );
}
