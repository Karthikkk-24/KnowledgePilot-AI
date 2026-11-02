import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BENCHMARK_FIXTURE_SLUGS } from '@knowledgepilot/shared';

export type SmokeBenchmarkFixture = {
  id: string;
  name: string;
  version: string;
  description?: string;
  documents: Array<{ filename: string; title: string }>;
  items: Array<{
    id: string;
    question: string;
    expectedAnswer?: string | null;
    relevantPassages?: string[];
    tags?: string[];
    difficulty?: string;
  }>;
};

function resolveFixtureDir(slug: string): string {
  const candidates = [
    path.resolve(process.cwd(), `fixtures/eval/${slug}`),
    path.resolve(process.cwd(), `../../fixtures/eval/${slug}`),
    path.resolve(__dirname, `../../../../../fixtures/eval/${slug}`),
    path.resolve(__dirname, `../../../../../../fixtures/eval/${slug}`),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'benchmark.json'))) {
      return candidate;
    }
  }
  throw new Error(`Could not locate fixtures/eval/${slug}/benchmark.json`);
}

export function resolveSmokeFixtureDir(): string {
  return resolveFixtureDir(BENCHMARK_FIXTURE_SLUGS.smoke);
}

export function loadSmokeBenchmarkFixture(): {
  dir: string;
  fixture: SmokeBenchmarkFixture;
} {
  const dir = resolveSmokeFixtureDir();
  const fixture = JSON.parse(
    readFileSync(path.join(dir, 'benchmark.json'), 'utf8'),
  ) as SmokeBenchmarkFixture;
  return { dir, fixture };
}

export function loadMultihopBenchmarkFixture(): {
  dir: string;
  fixture: SmokeBenchmarkFixture;
} {
  const dir = resolveFixtureDir(BENCHMARK_FIXTURE_SLUGS.multihop);
  const fixture = JSON.parse(
    readFileSync(path.join(dir, 'benchmark.json'), 'utf8'),
  ) as SmokeBenchmarkFixture;
  return { dir, fixture };
}
