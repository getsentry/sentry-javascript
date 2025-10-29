import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

describe('winston integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should capture winston logs with default levels', async () => {
    const runner = createRunner(__dirname, 'subject.ts')
      .expect({
        log: {
          items: [
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Test info message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.winston', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'error',
              body: 'Test error message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.winston', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
              },
            },
          ],
        },
      })
      .start();

    await runner.completed();
  });

  test('should capture winston logs with custom levels', async () => {
    const runner = createRunner(__dirname, 'subject.ts')
      .withEnv({ CUSTOM_LEVELS: 'true' })
      .expect({
        log: {
          items: [
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Test info message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.winston', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'error',
              body: 'Test error message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.winston', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Test info message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.winston', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'error',
              body: 'Test error message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.winston', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
              },
            },
          ],
        },
      })
      .start();

    await runner.completed();
  });

  test('should capture winston logs with metadata', async () => {
    const runner = createRunner(__dirname, 'subject.ts')
      .withEnv({ WITH_METADATA: 'true' })
      .expect({
        log: {
          items: [
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Test info message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.winston', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'error',
              body: 'Test error message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.winston', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Test message with metadata',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.winston', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                foo: { value: 'bar', type: 'string' },
                number: { value: 42, type: 'integer' },
              },
            },
          ],
        },
      })
      .start();

    await runner.completed();
  });
});
