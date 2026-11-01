'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  api,
  type ExperimentConfig,
  type LabCompareRow,
  type LabStatus,
  type PipelineConfig,
} from '../../lib/api';

const defaultDraft: PipelineConfig = {
  retrievalStrategy: 'hybrid',
  chunkingStrategy: 'structure_aware',
  rerankingEnabled: false,
  topK: 8,
  rerankTopN: 5,
  candidateMultiplier: 4,
  queryRewriteEnabled: false,
  multiQueryEnabled: false,
  contextCompressionEnabled: false,
  abstentionThreshold: 0.15,
  rrfK: 60,
};

function metric(row: LabCompareRow, key: string): string {
  const value = row.metricsSummary?.[key];
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return value.toFixed(3);
}

export default function LabPage() {
  const [status, setStatus] = useState<LabStatus | null>(null);
  const [configs, setConfigs] = useState<ExperimentConfig[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareRows, setCompareRows] = useState<LabCompareRow[]>([]);
  const [runIdsForCompare, setRunIdsForCompare] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftName, setDraftName] = useState('Custom hybrid');
  const [draft, setDraft] = useState<PipelineConfig>(defaultDraft);

  const refresh = useCallback(async () => {
    try {
      const labStatus = await api.getLabStatus();
      setStatus(labStatus);
      if (!labStatus.enabled) {
        setConfigs([]);
        setError(null);
        return;
      }
      const [cfgRows, runs] = await Promise.all([
        api.listExperimentConfigs(),
        api.listLabRuns(),
      ]);
      setConfigs(cfgRows);
      const linked = runs
        .filter((r) => r.experimentConfigId)
        .slice(0, 12)
        .map((r) => r.id);
      setRunIdsForCompare((prev) => (prev.length > 0 ? prev : linked.slice(0, 3)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lab');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  const selectedSummary = useMemo(() => {
    const selected = configs.filter((c) => selectedIds.includes(c.id));
    if (selected.length === 0) return 'No configs selected';
    return selected.map((c) => `${c.name}: ${c.summary}`).join(' · ');
  }, [configs, selectedIds]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function onSeed() {
    setBusy(true);
    try {
      await api.seedExperimentPresets();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setBusy(false);
    }
  }

  async function onCreate() {
    setBusy(true);
    try {
      await api.createExperimentConfig({
        name: draftName.trim() || 'Custom config',
        description: 'Created from lab controls',
        config: draft,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function onRunSelected() {
    if (selectedIds.length === 0) {
      setError('Select at least one config to run');
      return;
    }
    setBusy(true);
    try {
      const started: string[] = [];
      for (const id of selectedIds) {
        const run = await api.runExperimentConfig(id);
        started.push(run.id);
      }
      setRunIdsForCompare(started);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setBusy(false);
    }
  }

  async function onCompare() {
    if (runIdsForCompare.length < 2) {
      setError('Need at least two completed run ids to compare');
      return;
    }
    setBusy(true);
    try {
      const rows = await api.compareLabRuns(runIdsForCompare);
      setCompareRows(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compare failed');
    } finally {
      setBusy(false);
    }
  }

  if (status && !status.enabled) {
    return (
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>Experiment lab</h1>
        <p style={{ color: 'var(--muted)' }}>
          Lab is disabled. Set <code>FF_EXPERIMENT_LAB=true</code> (or leave unset outside
          production) and restart the API.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>Experiment lab</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 720 }}>
        Tune retrieval, chunking preference, and rerank — run the same smoke benchmark across
        configs, then compare metrics side by side.
      </p>

      {status ? (
        <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
          Flags: hybrid={String(status.flags.hybridSearch)} · rerank=
          {String(status.flags.reranking)} · rewrite={String(status.flags.queryRewrite)} ·
          multiQuery={String(status.flags.multiQuery)} · parentChild=
          {String(status.flags.parentChild)}
          {status.documentChunking.length > 0
            ? ` · corpus: ${status.documentChunking
                .map((d) => `${d.strategy}×${d.count}`)
                .join(', ')}`
            : ''}
        </p>
      ) : null}

      <section
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>Selected configuration</h2>
        <p style={{ margin: 0, fontSize: '0.92rem' }}>{selectedSummary}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.9rem' }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSeed()}
            style={btnSecondary}
          >
            Seed presets (≥3)
          </button>
          <button
            type="button"
            disabled={busy || selectedIds.length === 0}
            onClick={() => void onRunSelected()}
            style={btnPrimary}
          >
            Run selected on smoke benchmark
          </button>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Saved configs</h2>
        {configs.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No configs yet — seed presets to start.</p>
        ) : (
          configs.map((cfg) => {
            const checked = selectedIds.includes(cfg.id);
            return (
              <label
                key={cfg.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: '0.75rem',
                  alignItems: 'start',
                  padding: '0.85rem 1rem',
                  border: `1px solid ${checked ? 'var(--accent)' : 'var(--line)'}`,
                  borderRadius: 12,
                  background: 'var(--panel)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSelect(cfg.id)}
                  style={{ marginTop: 4 }}
                />
                <span>
                  <strong>{cfg.name}</strong>
                  <br />
                  <span style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>
                    {cfg.description ?? cfg.summary}
                  </span>
                  <br />
                  <code style={{ fontSize: '0.8rem' }}>{cfg.summary}</code>
                </span>
              </label>
            );
          })
        )}
      </section>

      <section
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem' }}>Lab controls → new config</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.75rem',
          }}
        >
          <label style={fieldLabel}>
            Name
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              style={fieldInput}
            />
          </label>
          <label style={fieldLabel}>
            Retrieval
            <select
              value={draft.retrievalStrategy}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  retrievalStrategy: e.target.value as PipelineConfig['retrievalStrategy'],
                }))
              }
              style={fieldInput}
            >
              <option value="vector">Vector only</option>
              <option value="keyword">Keyword only</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>
          <label style={fieldLabel}>
            Chunking
            <select
              value={draft.chunkingStrategy}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  chunkingStrategy: e.target.value as PipelineConfig['chunkingStrategy'],
                }))
              }
              style={fieldInput}
            >
              <option value="fixed">Fixed-size</option>
              <option value="structure_aware">Structure-aware</option>
              <option value="parent_child">Parent-child</option>
            </select>
          </label>
          <label style={fieldLabel}>
            Reranking
            <select
              value={draft.rerankingEnabled ? 'on' : 'off'}
              onChange={(e) =>
                setDraft((d) => ({ ...d, rerankingEnabled: e.target.value === 'on' }))
              }
              style={fieldInput}
            >
              <option value="off">Disabled</option>
              <option value="on">Enabled</option>
            </select>
          </label>
          <label style={fieldLabel}>
            Query rewrite
            <select
              value={draft.queryRewriteEnabled ? 'on' : 'off'}
              onChange={(e) =>
                setDraft((d) => ({ ...d, queryRewriteEnabled: e.target.value === 'on' }))
              }
              style={fieldInput}
            >
              <option value="off">Off</option>
              <option value="on">On</option>
            </select>
          </label>
          <label style={fieldLabel}>
            Multi-query
            <select
              value={draft.multiQueryEnabled ? 'on' : 'off'}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  multiQueryEnabled: e.target.value === 'on',
                  contextCompressionEnabled: e.target.value === 'on' ? true : d.contextCompressionEnabled,
                }))
              }
              style={fieldInput}
            >
              <option value="off">Off</option>
              <option value="on">On</option>
            </select>
          </label>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0.75rem 0' }}>
          Chunking preference is snapshotted on the run; re-ingest documents with that strategy
          (upload field or retry) so the corpus matches.
        </p>
        <button type="button" disabled={busy} onClick={() => void onCreate()} style={btnPrimary}>
          Save config
        </button>
      </section>

      <section
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>Compare runs</h2>
        <label style={{ ...fieldLabel, maxWidth: '100%' }}>
          Run IDs (comma-separated, ≥2)
          <input
            value={runIdsForCompare.join(',')}
            onChange={(e) =>
              setRunIdsForCompare(
                e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            style={fieldInput}
          />
        </label>
        <div style={{ marginTop: '0.75rem' }}>
          <button type="button" disabled={busy} onClick={() => void onCompare()} style={btnPrimary}>
            Compare
          </button>
        </div>

        {compareRows.length > 0 ? (
          <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr>
                  <th style={th}>Label</th>
                  <th style={th}>Config</th>
                  <th style={th}>State</th>
                  <th style={th}>Recall@k</th>
                  <th style={th}>MRR</th>
                  <th style={th}>nDCG</th>
                  <th style={th}>Faithfulness</th>
                  <th style={th}>Citation</th>
                  <th style={th}>Latency</th>
                  <th style={th}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row.runId}>
                    <td style={td}>{row.label ?? row.runId.slice(0, 8)}</td>
                    <td style={td}>
                      <code style={{ fontSize: '0.75rem' }}>{row.configSummary}</code>
                    </td>
                    <td style={td}>{row.state}</td>
                    <td style={td}>{metric(row, 'recallAtK')}</td>
                    <td style={td}>{metric(row, 'mrr')}</td>
                    <td style={td}>{metric(row, 'ndcgAtK')}</td>
                    <td style={td}>{metric(row, 'faithfulness')}</td>
                    <td style={td}>{metric(row, 'citationPrecision')}</td>
                    <td style={td}>{row.latencyMsTotal ?? '—'}</td>
                    <td style={td}>
                      <Link href={`/evaluation/runs/${row.runId}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
    </main>
  );
}

const btnPrimary: CSSProperties = {
  border: 0,
  borderRadius: 10,
  padding: '0.65rem 1rem',
  background: 'var(--accent)',
  color: '#fff',
  cursor: 'pointer',
};

const btnSecondary: CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: 10,
  padding: '0.65rem 1rem',
  background: '#fff',
  cursor: 'pointer',
};

const fieldLabel: CSSProperties = {
  display: 'grid',
  gap: 4,
  fontSize: '0.85rem',
};

const fieldInput: CSSProperties = {
  borderRadius: 10,
  border: '1px solid var(--line)',
  padding: '0.55rem 0.7rem',
  fontSize: '0.9rem',
};

const th: CSSProperties = {
  textAlign: 'left',
  borderBottom: '1px solid var(--line)',
  padding: '0.45rem 0.4rem',
  color: 'var(--muted)',
  fontWeight: 600,
};

const td: CSSProperties = {
  borderBottom: '1px solid var(--line)',
  padding: '0.5rem 0.4rem',
  verticalAlign: 'top',
};
