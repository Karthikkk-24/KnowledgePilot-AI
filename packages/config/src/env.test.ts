import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('applies defaults for local development', () => {
    const env = loadEnv({});
    expect(env.APP_NODE_ENV).toBe('development');
    expect(env.APP_PORT).toBe(3001);
    expect(env.REDIS_URL).toContain('6379');
  });

  it('parses overriding values', () => {
    const env = loadEnv({
      APP_PORT: '4000',
      APP_WEB_ORIGIN: 'http://localhost:4000',
    });
    expect(env.APP_PORT).toBe(4000);
  });
});
