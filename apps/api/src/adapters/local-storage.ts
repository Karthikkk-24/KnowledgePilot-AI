import { createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';

export type BlobStorage = {
  save(input: { key: string; body: Buffer | Readable }): Promise<string>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  absolutePath(key: string): string;
};

export function createLocalBlobStorage(rootDir: string): BlobStorage {
  const root = path.resolve(rootDir);

  async function ensureParent(filePath: string) {
    await mkdir(path.dirname(filePath), { recursive: true });
  }

  return {
    absolutePath(key: string) {
      return path.join(root, key);
    },
    async save(input) {
      const filePath = path.join(root, input.key);
      await ensureParent(filePath);
      if (Buffer.isBuffer(input.body)) {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(filePath, input.body);
      } else {
        await pipeline(input.body, createWriteStream(filePath));
      }
      return input.key;
    },
    async read(key: string) {
      const { readFile } = await import('node:fs/promises');
      return readFile(path.join(root, key));
    },
    async remove(key: string) {
      try {
        await unlink(path.join(root, key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    },
  };
}

export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export { createReadStream };
