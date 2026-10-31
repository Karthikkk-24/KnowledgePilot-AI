'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, type EvalRunSummary } from '../../lib/api';

export default function EvaluationPage() {
  const [runs, setRuns] = useState<EvalRunSummary[]>([]);
  const [benchmarks, setBenchmarks] = useState<
    Array<{ id: string; name: string; version: string; itemCount: number }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('baseline v1');

  const refresh = useCallback(async () => {
    try {
      const [runRows, benchRows] = await Promise.all([
        api.listEvalRuns(),
        api.listBenchmarks(),
      ]);
      setRuns(runRows);
      setBenchmarks(benchRows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load evaluation data');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function onSeed() {
    setBusy(true);
    try {
      await api.seedBenchmark();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setBusy(false);
    }
  }

  async function onStart() {
    setBusy(true);
    try {
      const run = await api.startEvalRun({
        label: label.trim() || undefined,
        retrievalStrategy: 'hybrid',
      });
      await refresh();
      window.location.href = `/evaluation/runs/${run.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start eval run');
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>Evaluation</h1>
      <p style={{ color: 'var(--muted)' }}>
        Seed the smoke golden set, run hybrid retrieval under a frozen config, and inspect
        Recall@k / MRR / nDCG / faithfulness / citation metrics.
      </p>

      <section
        style={{
          display: 'grid',
          gap: '0.75rem',
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'end' }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSeed()}
            style={{
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: '0.65rem 1rem',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            Seed smoke benchmark
          </button>
          <label style={{ display: 'grid', gap: 4, fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--muted)' }}>Run label</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{
                borderRadius: 10,
                border: '1px solid var(--line)',
                padding: '0.55rem 0.7rem',
              }}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onStart()}
            style={{
              border: 0,
              borderRadius: 10,
              padding: '0.65rem 1rem',
              background: 'var(--accent)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Start eval run
          </button>
        </div>
        {benchmarks.length > 0 ? (
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted)' }}>
            Benchmarks:{' '}
            {benchmarks.map((b) => `${b.name} (${b.itemCount} items)`).join(' · ')}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted)' }}>
            No benchmarks yet — seed to ingest fixture docs and create golden questions.
          </p>
        )}
      </section>

      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {runs.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No eval runs yet.</p>
        ) : (
          runs.map((run) => {
            const summary = (run.metricsSummary ?? {}) as Record<string, number>;
            return (
              <Link
                key={run.id}
                href={`/evaluation/runs/${run.id}`}
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  background: 'var(--panel)',
                  border: '1px solid var(--line)',
                  borderRadius: 12,
                  padding: '0.9rem 1rem',
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                  <strong>{run.label || run.id}</strong>
                  <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{run.state}</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {run.benchmarkSet.name} · {run.completedCount}/{run.itemCount} · progress{' '}
                  {run.progress}%
                  {typeof summary.recallAtK === 'number'
                    ? ` · Recall@k ${summary.recallAtK.toFixed(2)}`
                    : ''}
                  {typeof summary.mrr === 'number' ? ` · MRR ${summary.mrr.toFixed(2)}` : ''}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </main>
  );
}
