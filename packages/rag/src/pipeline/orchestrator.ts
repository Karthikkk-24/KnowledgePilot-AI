import { type PipelineConfig } from '../types.js';

export type RagOrchestrator = {
  /** Phase 1 implements grounded answer generation. */
  status: () => { ready: boolean; message: string; config: PipelineConfig };
};

export function createRagOrchestrator(config: PipelineConfig): RagOrchestrator {
  return {
    status() {
      return {
        ready: false,
        message: 'RAG pipeline stages land in Phase 1+',
        config,
      };
    },
  };
}
