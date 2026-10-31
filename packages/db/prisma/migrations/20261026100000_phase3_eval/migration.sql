-- Phase 3: benchmark sets + evaluation runs

CREATE TYPE "eval_run_state" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

CREATE TABLE "benchmark_sets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benchmark_sets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "benchmark_items" (
    "id" TEXT NOT NULL,
    "benchmark_set_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "expected_answer" TEXT,
    "relevant_chunk_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relevant_document_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relevant_passages" JSONB NOT NULL DEFAULT '[]',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "difficulty" TEXT,
    "ordinal" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benchmark_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "eval_runs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "benchmark_set_id" TEXT NOT NULL,
    "state" "eval_run_state" NOT NULL DEFAULT 'queued',
    "label" TEXT,
    "config_snapshot" JSONB NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "metrics_summary" JSONB,
    "latency_ms_total" INTEGER,
    "estimated_cost_usd" DOUBLE PRECISION,
    "error_message" TEXT,
    "bull_job_id" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eval_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "eval_item_results" (
    "id" TEXT NOT NULL,
    "eval_run_id" TEXT NOT NULL,
    "benchmark_item_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "expected_answer" TEXT,
    "retrieved_chunk_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cited_chunk_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answer_text" TEXT,
    "abstained" BOOLEAN NOT NULL DEFAULT false,
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "latency_ms" JSONB NOT NULL DEFAULT '{}',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_item_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "benchmark_sets_tenant_id_id_key" ON "benchmark_sets"("tenant_id", "id");
CREATE INDEX "benchmark_sets_tenant_id_created_at_idx" ON "benchmark_sets"("tenant_id", "created_at");

CREATE UNIQUE INDEX "benchmark_items_benchmark_set_id_external_id_key" ON "benchmark_items"("benchmark_set_id", "external_id");
CREATE INDEX "benchmark_items_benchmark_set_id_ordinal_idx" ON "benchmark_items"("benchmark_set_id", "ordinal");

CREATE INDEX "eval_runs_tenant_id_created_at_idx" ON "eval_runs"("tenant_id", "created_at");
CREATE INDEX "eval_runs_benchmark_set_id_created_at_idx" ON "eval_runs"("benchmark_set_id", "created_at");
CREATE INDEX "eval_runs_tenant_id_state_idx" ON "eval_runs"("tenant_id", "state");

CREATE UNIQUE INDEX "eval_item_results_eval_run_id_benchmark_item_id_key" ON "eval_item_results"("eval_run_id", "benchmark_item_id");
CREATE INDEX "eval_item_results_eval_run_id_idx" ON "eval_item_results"("eval_run_id");

ALTER TABLE "benchmark_sets" ADD CONSTRAINT "benchmark_sets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "benchmark_items" ADD CONSTRAINT "benchmark_items_benchmark_set_id_fkey" FOREIGN KEY ("benchmark_set_id") REFERENCES "benchmark_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_benchmark_set_id_fkey" FOREIGN KEY ("benchmark_set_id") REFERENCES "benchmark_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "eval_item_results" ADD CONSTRAINT "eval_item_results_eval_run_id_fkey" FOREIGN KEY ("eval_run_id") REFERENCES "eval_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eval_item_results" ADD CONSTRAINT "eval_item_results_benchmark_item_id_fkey" FOREIGN KEY ("benchmark_item_id") REFERENCES "benchmark_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
