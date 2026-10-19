import { describe, expect, it } from 'vitest';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('returns ok status', () => {
    const service = new HealthService();
    expect(service.getHealth().status).toBe('ok');
  });
});
