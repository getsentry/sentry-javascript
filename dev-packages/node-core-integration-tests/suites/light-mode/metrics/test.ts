import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('light mode metrics', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('captures all metric types with trace context', async () => {
    const runner = createRunner(__dirname, 'subject.js')
      .unignore('trace_metric')
      .expect({
        trace_metric: {
          items: [
            {
              timestamp: expect.any(Number),
              trace_id: expect.stringMatching(/^[\da-f]{32}$/),
              name: 'test.counter',
              type: 'counter',
              value: 1,
              attributes: {
                endpoint: { value: '/api/test', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node-light', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              trace_id: expect.stringMatching(/^[\da-f]{32}$/),
              name: 'test.gauge',
              type: 'gauge',
              unit: 'millisecond',
              value: 42,
              attributes: {
                server: { value: 'test-1', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node-light', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              trace_id: expect.stringMatching(/^[\da-f]{32}$/),
              name: 'test.distribution',
              type: 'distribution',
              unit: 'second',
              value: 200,
              attributes: {
                priority: { value: 'high', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node-light', type: 'string' },
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
