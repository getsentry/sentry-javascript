import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('metrics', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should capture all metric types', async () => {
    const runner = createRunner(__dirname, 'scenario.ts')
      .unignore('trace_metric')
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
                'sentry.sdk.name': { value: 'sentry.javascript.node-core', type: 'string' },
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
                'sentry.sdk.name': { value: 'sentry.javascript.node-core', type: 'string' },
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
                'sentry.sdk.name': { value: 'sentry.javascript.node-core', type: 'string' },
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
                'sentry.sdk.name': { value: 'sentry.javascript.node-core', type: 'string' },
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
                'sentry.sdk.name': { value: 'sentry.javascript.node-core', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              trace_id: expect.stringMatching(/^[\da-f]{32}$/),
              name: 'test.scope.attributes.counter',
              type: 'counter',
              value: 1,
              attributes: {
                action: {
                  type: 'string',
                  value: 'click',
                },
                scope_attribute_1: {
                  type: 'integer',
                  value: 1,
                },
                scope_attribute_2: {
                  type: 'string',
                  value: 'test',
                },
                scope_attribute_3: {
                  type: 'integer',
                  unit: 'gigabyte',
                  value: 38,
                },
                'sentry.environment': {
                  type: 'string',
                  value: 'test',
                },
                'sentry.release': {
                  type: 'string',
                  value: '1.0.0',
                },
                'sentry.sdk.name': {
                  type: 'string',
                  value: 'sentry.javascript.node-core',
                },
                'sentry.sdk.version': {
                  type: 'string',
                  value: expect.any(String),
                },
                'user.email': {
                  type: 'string',
                  value: 'test@example.com',
                },
                'user.id': {
                  type: 'string',
                  value: 'user-123',
                },
                'user.name': {
                  type: 'string',
                  value: 'testuser',
                },
              },
            },
          ],
        },
      })
      .start();

    await runner.completed();
  });
});
