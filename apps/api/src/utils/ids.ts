import { randomUUID } from 'node:crypto';

/** Short cuid-like ids used for documents/chunks before Prisma defaults. */
export function shortId(prefix: string, length = 24): string {
  const body = randomUUID().replace(/-/g, '').slice(0, length);
  return `${prefix}${body}`;
}
