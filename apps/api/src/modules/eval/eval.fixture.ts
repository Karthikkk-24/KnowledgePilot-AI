import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

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

export function resolveSmokeFixtureDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'fixtures/eval/smoke-v1'),
    path.resolve(process.cwd(), '../../fixtures/eval/smoke-v1'),
    path.resolve(__dirname, '../../../../../fixtures/eval/smoke-v1'),
    path.resolve(__dirname, '../../../../../../fixtures/eval/smoke-v1'),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'benchmark.json'))) {
      return candidate;
    }
  }
  throw new Error('Could not locate fixtures/eval/smoke-v1/benchmark.json');
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
