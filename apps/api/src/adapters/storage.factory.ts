import type { AppEnv } from '@knowledgepilot/config';
import { createLocalBlobStorage, type BlobStorage } from './local-storage';
import { createS3BlobStorage } from './s3-storage';

export function createBlobStorage(env: AppEnv): BlobStorage {
  if (env.objectStorageEnabled) {
    return createS3BlobStorage({
      bucket: env.STORAGE_BUCKET,
      region: env.STORAGE_REGION || 'us-east-1',
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY,
      endpoint: env.STORAGE_ENDPOINT || undefined,
    });
  }
  return createLocalBlobStorage(env.STORAGE_LOCAL_PATH);
}
