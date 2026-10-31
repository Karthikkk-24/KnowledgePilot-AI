'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type EvalRunDetail } from '../../../../lib/api';

export default function EvalRunDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [run, setRun] = useState<EvalRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.getEvalRun(id);
        if (!cancelled) {
          setRun(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load run');
        }
      }
    };
    void load();
    const timer = setInterval(() => void load(), 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);

  const summary = (run?.metricsSummary ?? {}) as Record<string, number>;

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <Link href="/evaluation" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
        ← Back to evaluation
      </Link>
      <h1 style={{ fontFamily: 'var(--font-display)', marginBottom: '0.35rem' }}>
        {run?.label || run?.id || 'Eval run'}
      </h1>
      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
      {!run && !error ? <p style={{ color: 'var(--muted)' }}>Loading…</p> : null}

      {run ? (
        <>
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>
            {run.benchmarkSet.name} · {run.state} · {run.completedCount}/{run.itemCount}
            {run.latencyMsTotal != null ? ` · ${run.latencyMsTotal}ms` : ''}
            {run.estimatedCostUsd != null
              ? ` · ~$${run.estimatedCostUsd.toFixed(6)}`
              : ''}
          </p>

          {run.errorMessage ? (
            <p style={{ color: '#b91c1c' }}>{run.errorMessage}</p>
          ) : null}

          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1.5rem',
            }}
          >
            {[
              ['Recall@k', summary.recallAtK],
              ['MRR', summary.mrr],
              ['nDCG@k', summary.ndcgAtK],
              ['Faithfulness', summary.faithfulness],
              ['Cite precision', summary.citationPrecision],
              ['Valid cites', summary.validCitationRate],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                style={{
                  background: 'var(--panel)',
                  border: '1px solid var(--line)',
                  borderRadius: 12,
                  padding: '0.75rem',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{label}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                  {typeof value === 'number' ? value.toFixed(3) : '—'}
                </div>
              </div>
            ))}
          </section>

          <details style={{ marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
            <summary>Config snapshot</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(run.configSnapshot, null, 2)}
            </pre>
          </details>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {run.items.map((item) => {
              const metrics = (item.metrics ?? {}) as Record<string, unknown>;
              return (
                <article
                  key={item.id}
                  style={{
                    background: 'var(--panel)',
                    border: '1px solid var(--line)',
                    borderRadius: 12,
                    padding: '0.9rem 1rem',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{item.question}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 4 }}>
                    {item.abstained ? 'abstained · ' : ''}
                    recall {Number(metrics.recallAtK ?? 0).toFixed(2)} · mrr{' '}
                    {Number(metrics.mrr ?? 0).toFixed(2)} · faith{' '}
                    {Number(metrics.faithfulness ?? 0).toFixed(2)}
                  </div>
                  {item.answerText ? (
                    <p style={{ margin: '0.6rem 0 0', whiteSpace: 'pre-wrap' }}>{item.answerText}</p>
                  ) : null}
                  {item.errorMessage ? (
                    <p style={{ color: '#b91c1c', margin: '0.5rem 0 0' }}>{item.errorMessage}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      ) : null}
    </main>
  );
}
