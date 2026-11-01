export const EVAL_QUEUE = 'eval';

export type EvalJobPayload = {
  tenantId: string;
  evalRunId: string;
};

export const SMOKE_BENCHMARK_ID = 'bench_smoke_v1';
export const MULTIHOP_BENCHMARK_ID = 'bench_multihop_v1';
