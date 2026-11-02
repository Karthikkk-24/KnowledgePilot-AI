import { BENCHMARK_IDS, QUEUE_NAMES } from '@knowledgepilot/shared';

export const EVAL_QUEUE = QUEUE_NAMES.eval;

export type EvalJobPayload = {
  tenantId: string;
  evalRunId: string;
};

export const SMOKE_BENCHMARK_ID = BENCHMARK_IDS.smoke;
export const MULTIHOP_BENCHMARK_ID = BENCHMARK_IDS.multihop;
