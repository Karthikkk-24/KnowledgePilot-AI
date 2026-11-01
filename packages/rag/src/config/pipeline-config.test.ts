import { describe, expect, it } from 'vitest';
import {
  mergePipelineConfig,
  parsePipelineConfig,
  presetLabConfigs,
  summarizePipelineConfig,
} from './pipeline-config';
import { defaultPipelineConfig } from '../types';

describe('pipeline-config', () => {
  it('parses a full config', () => {
    const parsed = parsePipelineConfig(defaultPipelineConfig);
    expect(parsed.retrievalStrategy).toBe('hybrid');
    expect(parsed.queryRewriteEnabled).toBe(false);
  });

  it('merges partial overrides', () => {
    const merged = mergePipelineConfig(defaultPipelineConfig, {
      retrievalStrategy: 'vector',
      rerankingEnabled: true,
      queryRewriteEnabled: true,
    });
    expect(merged.retrievalStrategy).toBe('vector');
    expect(merged.rerankingEnabled).toBe(true);
    expect(merged.queryRewriteEnabled).toBe(true);
    expect(merged.topK).toBe(defaultPipelineConfig.topK);
  });

  it('summarizes configs for lab UI', () => {
    const summary = summarizePipelineConfig(defaultPipelineConfig);
    expect(summary).toContain('retrieval=hybrid');
    expect(summary).toContain('rerank=off');
  });

  it('exposes at least three lab presets', () => {
    expect(presetLabConfigs.length).toBeGreaterThanOrEqual(3);
    const names = new Set(presetLabConfigs.map((p) => p.name));
    expect(names.size).toBe(presetLabConfigs.length);
    expect(presetLabConfigs.some((p) => p.config.retrievalStrategy === 'vector')).toBe(true);
    expect(presetLabConfigs.some((p) => p.config.retrievalStrategy === 'hybrid')).toBe(true);
    expect(presetLabConfigs.some((p) => p.config.rerankingEnabled)).toBe(true);
  });
});
