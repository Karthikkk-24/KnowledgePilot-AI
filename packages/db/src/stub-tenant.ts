import type { PrismaClient } from '@prisma/client';

/** Fixed Phase-1 single-tenant id so local demos stay stable across restarts. */
export const STUB_TENANT_ID = 'tenant_knowledgepilot_default';
export const STUB_TENANT_SLUG = 'default';

export async function ensureStubTenant(db: PrismaClient) {
  return db.tenant.upsert({
    where: { slug: STUB_TENANT_SLUG },
    create: {
      id: STUB_TENANT_ID,
      name: 'KnowledgePilot Default',
      slug: STUB_TENANT_SLUG,
    },
    update: {
      name: 'KnowledgePilot Default',
      deletedAt: null,
    },
  });
}
