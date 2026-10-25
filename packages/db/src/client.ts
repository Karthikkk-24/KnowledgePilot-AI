import { PrismaClient } from '@prisma/client';

export type DbClient = PrismaClient;

const globalForPrisma = globalThis as unknown as {
  knowledgepilotPrisma?: PrismaClient;
};

export function createDbClient(): DbClient {
  if (!globalForPrisma.knowledgepilotPrisma) {
    globalForPrisma.knowledgepilotPrisma = new PrismaClient({
      log: process.env.APP_NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }
  return globalForPrisma.knowledgepilotPrisma;
}

export async function disconnectDbClient(): Promise<void> {
  if (globalForPrisma.knowledgepilotPrisma) {
    await globalForPrisma.knowledgepilotPrisma.$disconnect();
    globalForPrisma.knowledgepilotPrisma = undefined;
  }
}
