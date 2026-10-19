import { describe, expect, it } from 'vitest';
import { createDbClient } from './client';

describe('createDbClient', () => {
  it('returns a phase-0 stub', () => {
    const client = createDbClient();
    expect(client.ready).toBe(false);
  });
});
