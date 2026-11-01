-- Phase 5: experiment configs + optional link from eval runs

CREATE TABLE "experiment_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experiment_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "experiment_configs_tenant_id_name_key" ON "experiment_configs"("tenant_id", "name");
CREATE INDEX "experiment_configs_tenant_id_created_at_idx" ON "experiment_configs"("tenant_id", "created_at");

ALTER TABLE "experiment_configs" ADD CONSTRAINT "experiment_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "eval_runs" ADD COLUMN IF NOT EXISTS "experiment_config_id" TEXT;

CREATE INDEX IF NOT EXISTS "eval_runs_experiment_config_id_idx" ON "eval_runs"("experiment_config_id");

ALTER TABLE "eval_runs" DROP CONSTRAINT IF EXISTS "eval_runs_experiment_config_id_fkey";
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_experiment_config_id_fkey" FOREIGN KEY ("experiment_config_id") REFERENCES "experiment_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
