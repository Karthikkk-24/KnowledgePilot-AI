-- Phase 6: persist chat/agent diagnostics + tool traces on messages
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "diagnostics" JSONB;
