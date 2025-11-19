import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('metrics', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should capture all metric types', async () => {
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
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              trace_id: expect.any(String),
              name: 'test.gauge',
              type: 'gauge',
              unit: 'millisecond',
              value: 42,
              attributes: {
                server: { value: 'test-1', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              trace_id: expect.any(String),
              name: 'test.distribution',
              type: 'distribution',
              unit: 'second',
              value: 200,
              attributes: {
                priority: { value: 'high', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              trace_id: expect.any(String),
              name: 'test.span.counter',
              type: 'counter',
              value: 1,
              attributes: {
                operation: { value: 'test', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              trace_id: expect.any(String),
              name: 'test.user.counter',
              type: 'counter',
              value: 1,
              attributes: {
                action: { value: 'click', type: 'string' },
                'user.id': { value: 'user-123', type: 'string' },
                'user.email': { value: 'test@example.com', type: 'string' },
                'user.name': { value: 'testuser', type: 'string' },
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
