-- Full-text search support for hybrid retrieval (Phase 2)

ALTER TABLE "chunks" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;

UPDATE "chunks"
SET "search_vector" = to_tsvector('english', coalesce("content", ''))
WHERE "search_vector" IS NULL;

CREATE INDEX IF NOT EXISTS "chunks_search_vector_gin_idx"
  ON "chunks"
  USING GIN ("search_vector");

CREATE OR REPLACE FUNCTION chunks_search_vector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.content, ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chunks_search_vector_update ON "chunks";
CREATE TRIGGER chunks_search_vector_update
  BEFORE INSERT OR UPDATE OF content ON "chunks"
  FOR EACH ROW
  EXECUTE FUNCTION chunks_search_vector_trigger();
