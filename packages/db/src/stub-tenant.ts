import type { PrismaClient } from '@prisma/client';
import { MembershipRole } from '@prisma/client';

/** Fixed Phase-1 single-tenant id so local demos stay stable across restarts. */
export const STUB_TENANT_ID = 'tenant_knowledgepilot_default';
export const STUB_TENANT_SLUG = 'default';
export const STUB_USER_ID = 'user_knowledgepilot_stub';

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

/** Local/demo identity used when AUTH_PROVIDER=stub. */
export async function ensureStubUser(db: PrismaClient) {
  await ensureStubTenant(db);
  const user = await db.user.upsert({
    where: { id: STUB_USER_ID },
    create: {
      id: STUB_USER_ID,
      email: 'stub@knowledgepilot.local',
      name: 'Stub User',
    },
    update: {
      email: 'stub@knowledgepilot.local',
      name: 'Stub User',
      deletedAt: null,
    },
  });

  await db.membership.upsert({
    where: {
      tenantId_userId: {
        tenantId: STUB_TENANT_ID,
        userId: user.id,
      },
    },
    create: {
      tenantId: STUB_TENANT_ID,
      userId: user.id,
      role: MembershipRole.owner,
    },
    update: {
      role: MembershipRole.owner,
    },
  });

  return user;
}
