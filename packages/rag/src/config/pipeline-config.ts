import { z } from 'zod';
import { defaultPipelineConfig, type PipelineConfig } from '../types';

export const pipelineConfigSchema = z.object({
  retrievalStrategy: z.enum(['vector', 'keyword', 'hybrid']),
  chunkingStrategy: z.enum(['fixed', 'structure_aware', 'parent_child']),
  rerankingEnabled: z.boolean(),
  topK: z.number().int().positive().max(50),
  rerankTopN: z.number().int().positive().max(50),
  candidateMultiplier: z.number().int().positive().max(20),
  queryRewriteEnabled: z.boolean(),
  multiQueryEnabled: z.boolean(),
  contextCompressionEnabled: z.boolean(),
  abstentionThreshold: z.number().min(0).max(1),
  rrfK: z.number().int().positive().max(200),
});

export function parsePipelineConfig(input: unknown): PipelineConfig {
  return pipelineConfigSchema.parse(input);
}

export function mergePipelineConfig(
  base: PipelineConfig,
  partial?: Partial<PipelineConfig>,
): PipelineConfig {
  return pipelineConfigSchema.parse({ ...base, ...partial });
}

export function summarizePipelineConfig(config: PipelineConfig): string {
  const parts = [
    `retrieval=${config.retrievalStrategy}`,
    `chunking=${config.chunkingStrategy}`,
    `rerank=${config.rerankingEnabled ? 'on' : 'off'}`,
    `rewrite=${config.queryRewriteEnabled ? 'on' : 'off'}`,
    `multiQuery=${config.multiQueryEnabled ? 'on' : 'off'}`,
    `compress=${config.contextCompressionEnabled ? 'on' : 'off'}`,
    `topK=${config.topK}`,
  ];
  return parts.join(' · ');
}

export const presetLabConfigs: Array<{ name: string; description: string; config: PipelineConfig }> =
  [
    {
      name: 'Vector baseline',
      description: 'Vector-only retrieval, no rerank',
      config: {
        ...defaultPipelineConfig,
        retrievalStrategy: 'vector',
        rerankingEnabled: false,
        queryRewriteEnabled: false,
        multiQueryEnabled: false,
        contextCompressionEnabled: false,
      },
    },
    {
      name: 'Hybrid default',
      description: 'Hybrid RRF retrieval (Phase 2 baseline)',
      config: {
        ...defaultPipelineConfig,
        retrievalStrategy: 'hybrid',
        rerankingEnabled: false,
      },
    },
    {
      name: 'Hybrid + rerank',
      description: 'Hybrid retrieval with reranking enabled',
      config: {
        ...defaultPipelineConfig,
        retrievalStrategy: 'hybrid',
        rerankingEnabled: true,
      },
    },
    {
      name: 'Hybrid + rewrite + multi-query',
      description: 'Advanced query expansion path',
      config: {
        ...defaultPipelineConfig,
        retrievalStrategy: 'hybrid',
        queryRewriteEnabled: true,
        multiQueryEnabled: true,
        contextCompressionEnabled: true,
      },
    },
  ];
