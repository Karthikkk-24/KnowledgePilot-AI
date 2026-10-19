import { APP_NAME, APP_VERSION } from '@knowledgepilot/shared';

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
      }}
    >
      <section
        style={{
          width: 'min(680px, 100%)',
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: '18px',
          padding: '2.5rem',
          boxShadow: '0 20px 60px rgba(28, 25, 23, 0.08)',
        }}
      >
        <p
          style={{
            margin: 0,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontSize: '0.75rem',
            color: 'var(--muted)',
          }}
        >
          Phase 0 · Monorepo online
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
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '1.05rem', lineHeight: 1.6 }}>
          Answers across document collections with verifiable evidence. This page confirms the Next.js
          app boots inside the Turborepo workspace.
        </p>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '0.5rem 1rem',
            margin: '1.75rem 0 0',
            fontSize: '0.95rem',
          }}
        >
          <dt style={{ color: 'var(--muted)' }}>Version</dt>
          <dd style={{ margin: 0 }}>{APP_VERSION}</dd>
          <dt style={{ color: 'var(--muted)' }}>API</dt>
          <dd style={{ margin: 0 }}>
            <a href={`${apiBase}/health`}>{apiBase}/health</a>
          </dd>
        </dl>
      </section>
    </main>
  );
}
