import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import type { BlobStorage } from './local-storage';
import { streamToBuffer } from './local-storage';

export type S3StorageOptions = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
};

export function createS3BlobStorage(options: S3StorageOptions): BlobStorage {
  const client = new S3Client({
    region: options.region,
    endpoint: options.endpoint || undefined,
    forcePathStyle: Boolean(options.endpoint),
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  });

  return {
    absolutePath(key: string) {
      return `s3://${options.bucket}/${key}`;
    },
    async save(input) {
      const body = Buffer.isBuffer(input.body)
        ? input.body
        : await streamToBuffer(input.body as Readable);
      await client.send(
        new PutObjectCommand({
          Bucket: options.bucket,
          Key: input.key,
          Body: body,
        }),
      );
      return input.key;
    },
    async read(key: string) {
      const result = await client.send(
        new GetObjectCommand({
          Bucket: options.bucket,
          Key: key,
        }),
      );
      if (!result.Body) {
        throw new Error(`S3 object missing body for key ${key}`);
      }
      return streamToBuffer(result.Body as Readable);
    },
    async remove(key: string) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: options.bucket,
          Key: key,
        }),
      );
    },
  };
}
