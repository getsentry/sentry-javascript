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
              body: 'Message with args: hello 123',
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
                key: { value: 'value', type: 'string' },
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

  test('should extract objects as searchable context attributes', async () => {
    const runner = createRunner(__dirname, 'subject-object-context.ts')
      .expect({
        log: {
          items: [
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'User logged in',
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
                userId: { value: 123, type: 'integer' },
                sessionId: { value: 'abc-123', type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'warn',
              body: 'Payment processed',
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
                orderId: { value: 456, type: 'integer' },
                amount: { value: 99.99, type: 'double' },
                currency: { value: 'USD', type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'error',
              body: 'Error occurred in payment module',
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
                errorCode: { value: 'E001', type: 'string' },
                retryable: { value: true, type: 'boolean' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'debug',
              body: 'Processing items',
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
                'consola.args.0': { value: '[1,2,3,4,5]', type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Complex data',
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
                user: { value: '{"id":789,"name":"Jane"}', type: 'string' },
                metadata: { value: '{"source":"api"}', type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Deep object',
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
                // Nested objects are extracted and normalized respecting normalizeDepth setting
                level1: { value: '{"level2":{"level3":{"level4":"[Object]"}}}', type: 'string' },
                simpleKey: { value: 'simple value', type: 'string' },
              },
            },
          ],
        },
      })
      .start();

    await runner.completed();
  });

  test('should preserve special objects (Date, Error, RegExp, Map, Set) as context attributes', async () => {
    const runner = createRunner(__dirname, 'subject-special-objects.ts')
      .expect({
        log: {
          items: [
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Current time:',
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
                // Date objects serialize with extra quotes
                'consola.args.0': { value: '"2023-01-01T00:00:00.000Z"', type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'error',
              body: 'Error occurred:',
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
                // Error objects serialize as empty object (properties are non-enumerable)
                'consola.args.0': { value: '{}', type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Pattern:',
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
                // RegExp objects serialize as empty object
                'consola.args.0': { value: '{}', type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Collections:',
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
                // Map converted to object, Set converted to array
                'consola.args.0': { value: '{"key":"value"}', type: 'string' },
                'consola.args.1': { value: '[1,2,3]', type: 'string' },
              },
            },
            {
              timestamp: expect.any(Number),
              level: 'info',
              body: 'Mixed data a-simple-string',
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
                // Plain object properties extracted
                userId: { value: 123, type: 'integer' },
                // Nested metadata object normalized (depth 3)
                nestedMetadata: { value: '{"id":789,"name":"Jane","source":"api"}', type: 'string' },
                // Date preserved as args
                'consola.args.0': { value: '"2023-06-15T12:00:00.000Z"', type: 'string' },
                // Map converted to object and stored as args
                'consola.args.1': { value: '{"key":"value"}', type: 'string' },
              },
            },
          ],
        },
      })
      .start();

    await runner.completed();
  });
});
