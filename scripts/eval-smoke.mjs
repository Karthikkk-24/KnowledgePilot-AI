#!/usr/bin/env node
/**
 * Phase 3 CI/local smoke: seed smoke benchmark, start a run, wait for completion, assert basics.
 * Requires API + Postgres + Redis (ingestion + eval workers) to be running.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';

async function request(path, init) {
  const response = await fetch(`${API_URL}${path}`, init);
  const json = await response.json();
  if (!response.ok || json.error) {
    throw new Error(json.error?.message || `Request failed (${response.status}) for ${path}`);
  }
  return json.data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`[eval-smoke] API ${API_URL}`);
  await request('/health').catch(async () => {
    // health is outside /v1
    const response = await fetch(`${API_URL}/health`);
    if (!response.ok) throw new Error('API health check failed');
  });

  console.log('[eval-smoke] seeding smoke benchmark…');
  const bench = await request('/v1/benchmarks/seed', { method: 'POST' });
  if (!bench?.items?.length) {
    throw new Error('Seed returned no items');
  }
  console.log(`[eval-smoke] benchmark ${bench.id} with ${bench.items.length} items`);

  console.log('[eval-smoke] starting eval run…');
  const started = await request('/v1/eval/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      benchmarkSetId: bench.id,
      label: 'ci-smoke',
      retrievalStrategy: 'hybrid',
    }),
  });

  const deadline = Date.now() + 120_000;
  let run = started;
  while (Date.now() < deadline) {
    run = await request(`/v1/eval/runs/${started.id}`);
    console.log(
      `[eval-smoke] state=${run.state} progress=${run.progress}% completed=${run.completedCount}/${run.itemCount}`,
    );
    if (run.state === 'completed' || run.state === 'failed') break;
    await sleep(1500);
  }

  if (run.state !== 'completed') {
    throw new Error(`Eval run did not complete: state=${run.state} error=${run.errorMessage}`);
  }

  const summary = run.metricsSummary ?? {};
  console.log('[eval-smoke] metrics', summary);

  if (typeof summary.itemCount !== 'number' || summary.itemCount < 1) {
    throw new Error('metrics summary missing itemCount');
  }
  if (typeof summary.recallAtK !== 'number') {
    throw new Error('metrics summary missing recallAtK');
  }

  // Retention / ERR questions should retrieve something useful under hybrid+mock.
  const retention = run.items.find((i) => /retention/i.test(i.question));
  if (retention && Number(retention.metrics?.recallAtK ?? 0) <= 0) {
    console.warn('[eval-smoke] warning: retention item recall@k was 0');
  }

  console.log('[eval-smoke] OK');
}

main().catch((error) => {
  console.error('[eval-smoke] FAILED', error);
  process.exit(1);
});
