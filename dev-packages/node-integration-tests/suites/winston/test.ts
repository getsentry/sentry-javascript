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

  test("should capture winston logs with filter but don't show custom level warnings", async () => {
    const runner = createRunner(__dirname, 'subject.ts')
      .withEnv({ WITH_FILTER: 'true' })
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

    const logs = runner.getLogs();

    const warning = logs.find(log => log.includes('Winston log level info is not captured by Sentry.'));

    expect(warning).not.toBeDefined();
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

  test('should skip unmapped custom levels when not in the levels option', async () => {
    const runner = createRunner(__dirname, 'subject.ts')
      .withEnv({ UNMAPPED_CUSTOM_LEVEL: 'true' })
      .expect({
        log: {
          items: [
            // First, the default logger captures info and error
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
            // Then the unmapped logger only captures error (myUnknownLevel defaults to info, which is skipped)
            {
              timestamp: expect.any(Number),
              level: 'error',
              body: 'This error message should be captured',
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

    const logs = runner.getLogs();

    const warning = logs.find(log => log.includes('Winston log level myUnknownLevel is not captured by Sentry.'));

    expect(warning).toBeDefined();
  });

  test('should map custom winston levels to Sentry severity levels', async () => {
    const runner = createRunner(__dirname, 'subject.ts')
      .withEnv({ CUSTOM_LEVEL_MAPPING: 'true' })
      .expect({
        log: {
          items: [
            // First, the default logger captures info and error
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
            // Then the mapped logger uses custom level mappings
            {
              timestamp: expect.any(Number),
              level: 'fatal', // 'critical' maps to 'fatal'
              body: 'This is a critical message',
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
              level: 'warn', // 'warning' maps to 'warn'
              body: 'This is a warning message',
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
              level: 'info', // 'notice' maps to 'info'
              body: 'This is a notice message',
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
});
