import Link from 'next/link';
import { APP_NAME, APP_VERSION } from '@knowledgepilot/shared';

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function HomePage() {
  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '2.5rem 1.5rem 4rem' }}>
      <p style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.75rem', color: 'var(--muted)' }}>
        Phase 3 · Evaluation
      </p>
      <h1
        style={{
          margin: '0.75rem 0 0.5rem',
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2.4rem, 6vw, 3.4rem)',
          lineHeight: 1.05,
        }}
      >
        {APP_NAME}
      </h1>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: '1.05rem', lineHeight: 1.6, maxWidth: 640 }}>
        Upload documents, chat with hybrid retrieval, and run a seeded benchmark to store Recall@k,
        MRR, faithfulness, and citation metrics.
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.75rem', flexWrap: 'wrap' }}>
        <Link
          href="/evaluation"
          style={{
            background: 'var(--accent)',
            color: '#fff',
            textDecoration: 'none',
            padding: '0.75rem 1.1rem',
            borderRadius: 10,
          }}
        >
          Open evaluation
        </Link>
        <Link
          href="/documents"
          style={{
            border: '1px solid var(--line)',
            color: 'var(--ink)',
            textDecoration: 'none',
            padding: '0.75rem 1.1rem',
            borderRadius: 10,
            background: 'var(--panel)',
          }}
        >
          Documents
        </Link>
        <Link
          href="/chat"
          style={{
            border: '1px solid var(--line)',
            color: 'var(--ink)',
            textDecoration: 'none',
            padding: '0.75rem 1.1rem',
            borderRadius: 10,
            background: 'var(--panel)',
          }}
        >
          Chat
        </Link>
      </div>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '0.5rem 1rem',
          margin: '2rem 0 0',
          fontSize: '0.95rem',
        }}
      >
        <dt style={{ color: 'var(--muted)' }}>Version</dt>
        <dd style={{ margin: 0 }}>{APP_VERSION}</dd>
        <dt style={{ color: 'var(--muted)' }}>API health</dt>
        <dd style={{ margin: 0 }}>
          <a href={`${apiBase}/health`}>{apiBase}/health</a>
        </dd>
      </dl>
    </main>
  );
}
