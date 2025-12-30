import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

describe('consola integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should capture consola logs with default levels', async () => {
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
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'info', type: 'string' },
                'consola.level': { value: 3, type: 'integer' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'error',
              body: 'Test error message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'error', type: 'string' },
                'consola.level': { value: 0, type: 'integer' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'warn',
              body: 'Test warn message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'warn', type: 'string' },
                'consola.level': { value: 1, type: 'integer' },
              },
            },
          ],
        },
      })
      .start();

    await runner.completed();
  });

  test('should capture different consola log types', async () => {
    const runner = createRunner(__dirname, 'subject-types.ts')
      .expect({
        log: {
          items: [
            // Basic logs from default test
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Test info message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'info', type: 'string' },
                'consola.level': { value: 3, type: 'integer' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'error',
              body: 'Test error message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'error', type: 'string' },
                'consola.level': { value: 0, type: 'integer' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'warn',
              body: 'Test warn message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'warn', type: 'string' },
                'consola.level': { value: 1, type: 'integer' },
              },
            },
            // Consola-specific log types
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Test success message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'success', type: 'string' },
                'consola.level': { value: 3, type: 'integer' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'error',
              body: 'Test fail message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'fail', type: 'string' },
                'consola.level': { value: 3, type: 'integer' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Test ready message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'ready', type: 'string' },
                'consola.level': { value: 3, type: 'integer' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Test start message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'start', type: 'string' },
                'consola.level': { value: 3, type: 'integer' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Test box message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'box', type: 'string' },
                'consola.level': { value: 3, type: 'integer' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'debug',
              body: 'Test verbose message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'verbose', type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'debug',
              body: 'Test debug message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'debug', type: 'string' },
                'consola.level': { value: 4, type: 'integer' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'trace',
              body: 'Test trace message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'trace', type: 'string' },
                'consola.level': { value: 5, type: 'integer' },
              },
            },
          ],
        },
      })
      .start();

    await runner.completed();
  });

  test('should capture consola logs with arguments formatting', async () => {
    const runner = createRunner(__dirname, 'subject-args.ts')
      .expect({
        log: {
          items: [
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Message with args: hello 123 {"key":"value"} [1,2,3]',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'info', type: 'string' },
                'consola.level': { value: 3, type: 'integer' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'debug',
              body: 'Debug message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'debug', type: 'string' },
                'consola.level': { value: 2, type: 'integer' },
                customData: {
                  value: '{"nested":"value","count":42}',
                  type: 'string',
                },
                sessionId: {
                  value: 'abc-123-def',
                  type: 'string',
                },
                userId: {
                  value: 12345,
                  type: 'integer',
                },
              },
            },
          ],
        },
      })
      .start();

    await runner.completed();
  });

  test('should capture consola logs with tags', async () => {
    const runner = createRunner(__dirname, 'subject-tags.ts')
      .expect({
        log: {
          items: [
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Tagged info message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.tag': { value: 'api', type: 'string' },
                'consola.type': { value: 'info', type: 'string' },
                'consola.level': { value: 3, type: 'integer' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'error',
              body: 'Tagged error message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.tag': { value: 'api', type: 'string' },
                'consola.type': { value: 'error', type: 'string' },
                'consola.level': { value: 0, type: 'integer' },
              },
            },
          ],
        },
      })
      .start();

    await runner.completed();
  });

  test('should respect custom level filtering', async () => {
    const runner = createRunner(__dirname, 'subject-custom-levels.ts')
      .expect({
        log: {
          items: [
            // Should capture the warn message
            {
              timestamp: expect.any(Number),
              level: 'warn',
              body: 'This should be captured',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'warn', type: 'string' },
                'consola.level': { value: 1, type: 'integer' },
              },
            },
            // Should capture the error message
            {
              timestamp: expect.any(Number),
              level: 'error',
              body: 'This should also be captured',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'error', type: 'string' },
                'consola.level': { value: 0, type: 'integer' },
              },
            },
          ],
        },
      })
      .start();

    await runner.completed();
  });

  test('should capture different consola level methods', async () => {
    const runner = createRunner(__dirname, 'subject-levels.ts')
      .expect({
        log: {
          items: [
            {
              timestamp: expect.any(Number),
              level: 'fatal',
              body: 'Fatal level message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'fatal', type: 'string' },
                'consola.level': { value: 0, type: 'integer' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'warn',
              body: 'Warning level message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'warn', type: 'string' },
                'consola.level': { value: 1, type: 'integer' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Info level message',
              severity_number: expect.any(Number),
              trace_id: expect.any(String),
              attributes: {
                'sentry.origin': { value: 'auto.log.consola', type: 'string' },
                'sentry.release': { value: '1.0.0', type: 'string' },
                'sentry.environment': { value: 'test', type: 'string' },
                'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                'sentry.sdk.version': { value: expect.any(String), type: 'string' },
                'server.address': { value: expect.any(String), type: 'string' },
                'consola.type': { value: 'info', type: 'string' },
                'consola.level': { value: 3, type: 'integer' },
              },
            },
          ],
        },
      })
      .start();

    await runner.completed();
  });
});
