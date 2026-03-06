import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('metrics server.address', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should add server.address attribute to metrics when serverName is set', async () => {
    const runner = createRunner(__dirname, 'scenario.ts')
      .expect({
        trace_metric: {
          items: [
            {
              timestamp: expect.any(Number),
              trace_id: expect.any(String),
              name: 'test.counter',
              type: 'counter',
              value: 1,
              attributes: {
                endpoint: { value: '/api/test', type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
              },
            },
          ],
        },
      })
      .start();

    await runner.completed();
  });
});
