/**
 * Prisma client is wired in Phase 1. Phase 0 exposes a stub so apps can import the package boundary.
 */
export type DbClient = {
  ready: false;
  reason: string;
};

export function createDbClient(): DbClient {
  return {
    ready: false,
    reason: 'Prisma schema and client land in Phase 1',
  };
}
