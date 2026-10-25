export const INGESTION_QUEUE = 'ingestion';

export type IngestionJobPayload = {
  tenantId: string;
  documentId: string;
  ingestionJobId: string;
};
