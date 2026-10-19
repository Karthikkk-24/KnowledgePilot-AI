import { describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger';

describe('createLogger', () => {
  it('writes structured JSON info logs', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = createLogger({ service: 'test' });
    logger.info('hello', { requestId: 'req_1' });
    expect(spy).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({
      level: 'info',
      service: 'test',
      message: 'hello',
      requestId: 'req_1',
    });
    spy.mockRestore();
  });
});
