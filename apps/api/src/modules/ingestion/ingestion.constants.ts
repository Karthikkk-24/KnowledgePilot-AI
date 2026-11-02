import { QUEUE_NAMES } from '@knowledgepilot/shared';

export const INGESTION_QUEUE = QUEUE_NAMES.ingestion;

export type IngestionJobPayload = {
  tenantId: string;
  documentId: string;
  ingestionJobId: string;
};
