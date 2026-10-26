export type MetadataFilters = {
  documentIds?: string[];
  mimeTypes?: string[];
  tags?: string[];
  createdAfter?: string;
  createdBefore?: string;
};

export function normalizeMetadataFilters(filters?: MetadataFilters): MetadataFilters | undefined {
  if (!filters) {
    return undefined;
  }

  const documentIds = filters.documentIds?.filter(Boolean).slice(0, 50);
  const mimeTypes = filters.mimeTypes?.filter(Boolean).slice(0, 20);
  const tags = filters.tags?.filter(Boolean).slice(0, 20);

  const normalized: MetadataFilters = {};
  if (documentIds && documentIds.length > 0) normalized.documentIds = documentIds;
  if (mimeTypes && mimeTypes.length > 0) normalized.mimeTypes = mimeTypes;
  if (tags && tags.length > 0) normalized.tags = tags;
  if (filters.createdAfter) normalized.createdAfter = filters.createdAfter;
  if (filters.createdBefore) normalized.createdBefore = filters.createdBefore;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}
