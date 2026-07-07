import { afterAll, expect } from 'vitest';
import { conditionalTest } from '../../utils';
import { cleanupChildProcesses, createEsmTests } from '../../utils/runner';

conditionalTest({ min: 20 })('Pino integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('has different trace ids for logs from different spans', async () => {
      await createRunner()
        .withMockSentryServer()
        .ignore('event')
        .ignore('transaction')
        .expect({
          log: log => {
            const traceId1 = log.items?.[0]?.trace_id;
            const traceId2 = log.items?.[1]?.trace_id;
            expect(traceId1).not.toBe(traceId2);
          },
        })
        .start()
        .completed();
    });

    test('captures event and logs', async () => {
      await createRunner()
        .withMockSentryServer()
        .ignore('transaction')
        .expect({
          event: {
            exception: {
              values: [
                {
                  type: 'Error',
                  value: 'oh no',
                  mechanism: {
                    type: 'auto.log.pino',
                    handled: true,
                  },
                  stacktrace: {
                    frames: expect.arrayContaining([
                      expect.objectContaining({
                        function: '?',
                        in_app: true,
                        module: 'scenario',
                      }),
                    ]),
                  },
                },
              ],
            },
            contexts: {
              pino: {
                name: 'myapp',
                module: 'authentication',
                msg: 'oh no',
              },
            },
          },
        })
        .expect({
          log: {
            items: [
              {
                timestamp: expect.any(Number),
                level: 'info',
                body: 'hello world',
                trace_id: expect.any(String),
                severity_number: 9,
                attributes: {
                  name: { value: 'myapp', type: 'string' },
                  'pino.logger.level': { value: 30, type: 'integer' },
                  user: { value: 'user-id', type: 'string' },
                  something: {
                    type: 'string',
                    value: '{"more":3,"complex":"nope"}',
                  },
                  'sentry.origin': { value: 'auto.log.pino', type: 'string' },
                  'sentry.release': { value: '1.0', type: 'string' },
                  'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                },
              },
              {
                timestamp: expect.any(Number),
                level: 'error',
                body: 'oh no',
                trace_id: expect.any(String),
                severity_number: 17,
                attributes: {
                  name: { value: 'myapp', type: 'string' },
                  module: { value: 'authentication', type: 'string' },
                  msg: { value: 'oh no', type: 'string' },
                  err: { value: expect.any(String), type: 'string' },
                  'pino.logger.level': { value: 50, type: 'integer' },
                  'sentry.origin': { value: 'auto.log.pino', type: 'string' },
                  'sentry.release': { value: '1.0', type: 'string' },
                  'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                },
              },
            ],
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario-next.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures with Pino integrated channel', async () => {
      await createRunner()
        .withMockSentryServer()
        .ignore('transaction')
        .expect({
          event: {
            exception: {
              values: [
                {
                  type: 'Error',
                  value: 'oh no',
                  mechanism: {
                    type: 'auto.log.pino',
                    handled: true,
                  },
                  stacktrace: {
                    frames: expect.arrayContaining([
                      expect.objectContaining({
                        function: '?',
                        in_app: true,
                        module: 'scenario-next',
                        context_line: "      logger.error(new Error('oh no'));",
                      }),
                    ]),
                  },
                },
              ],
            },
            contexts: {
              pino: {
                name: 'myapp',
                msg: 'oh no',
              },
            },
          },
        })
        .expect({
          log: {
            items: [
              {
                timestamp: expect.any(Number),
                level: 'info',
                body: 'hello world',
                trace_id: expect.any(String),
                severity_number: 9,
                attributes: {
                  name: { value: 'myapp', type: 'string' },
                  'pino.logger.level': { value: 30, type: 'integer' },
                  user: { value: 'user-id', type: 'string' },
                  something: {
                    type: 'string',
                    value: '{"more":3,"complex":"nope"}',
                  },
                  'sentry.origin': { value: 'auto.log.pino', type: 'string' },
                  'sentry.release': { value: '1.0', type: 'string' },
                  'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                },
              },
              {
                timestamp: expect.any(Number),
                level: 'error',
                body: 'oh no',
                trace_id: expect.any(String),
                severity_number: 17,
                attributes: {
                  name: { value: 'myapp', type: 'string' },
                  msg: { value: 'oh no', type: 'string' },
                  err: { value: expect.any(String), type: 'string' },
                  'pino.logger.level': { value: 50, type: 'integer' },
                  'sentry.origin': { value: 'auto.log.pino', type: 'string' },
                  'sentry.release': { value: '1.0', type: 'string' },
                  'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                },
              },
            ],
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario-track.mjs', 'instrument-auto-off.mjs', (createRunner, test) => {
    test('captures logs when autoInstrument is false and logger is tracked', async () => {
      await createRunner()
        .withMockSentryServer()
        .ignore('transaction')
        .expect({
          log: {
            items: [
              {
                timestamp: expect.any(Number),
                level: 'info',
                body: 'hello world',
                trace_id: expect.any(String),
                severity_number: 9,
                attributes: {
                  name: { value: 'myapp', type: 'string' },
                  'pino.logger.level': { value: 30, type: 'integer' },
                  user: { value: 'user-id', type: 'string' },
                  something: {
                    type: 'string',
                    value: '{"more":3,"complex":"nope"}',
                  },
                  msg: { value: 'hello world', type: 'string' },
                  'sentry.origin': { value: 'auto.log.pino', type: 'string' },
                  'sentry.release': { value: '1.0', type: 'string' },
                  'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                },
              },
              {
                timestamp: expect.any(Number),
                level: 'error',
                body: 'oh no',
                trace_id: expect.any(String),
                severity_number: 17,
                attributes: {
                  name: { value: 'myapp', type: 'string' },
                  module: { value: 'authentication', type: 'string' },
                  msg: { value: 'oh no', type: 'string' },
                  err: { value: expect.any(String), type: 'string' },
                  'pino.logger.level': { value: 50, type: 'integer' },
                  'sentry.origin': { value: 'auto.log.pino', type: 'string' },
                  'sentry.release': { value: '1.0', type: 'string' },
                  'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                },
              },
            ],
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario-structured-logging.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures structured logs with msg field', async () => {
      await createRunner()
        .withMockSentryServer()
        .ignore('transaction')
        .expect({
          log: {
            items: [
              {
                timestamp: expect.any(Number),
                level: 'info',
                body: 'test-msg',
                trace_id: expect.any(String),
                severity_number: 9,
                attributes: {
                  name: { value: 'myapp', type: 'string' },
                  'pino.logger.level': { value: 30, type: 'integer' },
                  msg: { value: 'test-msg', type: 'string' },
                  'sentry.origin': { value: 'auto.log.pino', type: 'string' },
                  'sentry.release': { value: '1.0', type: 'string' },
                  'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                },
              },
              {
                timestamp: expect.any(Number),
                level: 'info',
                body: 'test-msg-2',
                trace_id: expect.any(String),
                severity_number: 9,
                attributes: {
                  name: { value: 'myapp', type: 'string' },
                  'pino.logger.level': { value: 30, type: 'integer' },
                  msg: { value: 'test-msg-2', type: 'string' },
                  userId: { value: 'user-123', type: 'string' },
                  action: { value: 'login', type: 'string' },
                  'sentry.origin': { value: 'auto.log.pino', type: 'string' },
                  'sentry.release': { value: '1.0', type: 'string' },
                  'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                },
              },
              {
                timestamp: expect.any(Number),
                level: 'info',
                body: 'test-string',
                trace_id: expect.any(String),
                severity_number: 9,
                attributes: {
                  name: { value: 'myapp', type: 'string' },
                  'pino.logger.level': { value: 30, type: 'integer' },
                  'sentry.origin': { value: 'auto.log.pino', type: 'string' },
                  'sentry.release': { value: '1.0', type: 'string' },
                  'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                },
              },
            ],
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario-error-context.mjs', 'instrument.mjs', (createRunner, test) => {
    test('attaches log message and fields to captured error events', async () => {
      await createRunner()
        .withMockSentryServer()
        .ignore('transaction')
        .ignore('log')
        .expect({
          event: {
            exception: {
              values: [
                {
                  type: 'Error',
                  value: 'failed to fetch user',
                  mechanism: {
                    type: 'auto.log.pino',
                    handled: true,
                  },
                },
              ],
            },
            contexts: {
              pino: {
                name: 'myapp',
                requestId: 'abc-123',
                message: 'upstream said Not Found',
                msg: 'Failed to do X',
              },
            },
          },
        })
        .expect({
          event: {
            message: 'Something went wrong',
            level: 'error',
            contexts: {
              pino: {
                name: 'myapp',
                requestId: 'def-456',
                msg: 'Something went wrong',
              },
            },
          },
        })
        .start()
        .completed();
    });
  });

  createEsmTests(__dirname, 'scenario-custom-keys.mjs', 'instrument.mjs', (createRunner, test) => {
    test('captures logs with custom messageKey and errorKey', async () => {
      await createRunner()
        .withMockSentryServer()
        .ignore('transaction')
        .expect({
          event: {
            exception: {
              values: [
                {
                  type: 'Error',
                  value: 'Custom error key',
                  mechanism: {
                    type: 'auto.log.pino',
                    handled: true,
                  },
                  stacktrace: {
                    frames: expect.arrayContaining([
                      expect.objectContaining({
                        function: '?',
                        in_app: true,
                        module: 'scenario-custom-keys',
                      }),
                    ]),
                  },
                },
              ],
            },
            contexts: {
              pino: {
                name: 'myapp',
                message: 'Custom error key',
              },
            },
          },
        })
        .expect({
          log: {
            items: [
              {
                timestamp: expect.any(Number),
                level: 'info',
                body: 'Custom message key',
                trace_id: expect.any(String),
                severity_number: 9,
                attributes: {
                  name: { value: 'myapp', type: 'string' },
                  'pino.logger.level': { value: 30, type: 'integer' },
                  user: { value: 'user-123', type: 'string' },
                  action: { value: 'custom-key-test', type: 'string' },
                  message: { value: 'Custom message key', type: 'string' },
                  'sentry.origin': { value: 'auto.log.pino', type: 'string' },
                  'sentry.release': { value: '1.0', type: 'string' },
                  'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                },
              },
              {
                timestamp: expect.any(Number),
                level: 'error',
                body: 'Custom error key',
                trace_id: expect.any(String),
                severity_number: 17,
                attributes: {
                  name: { value: 'myapp', type: 'string' },
                  'pino.logger.level': { value: 50, type: 'integer' },
                  message: { value: 'Custom error key', type: 'string' },
                  error: { value: expect.any(String), type: 'string' },
                  'sentry.origin': { value: 'auto.log.pino', type: 'string' },
                  'sentry.release': { value: '1.0', type: 'string' },
                  'sentry.sdk.name': { value: 'sentry.javascript.node', type: 'string' },
                },
              },
            ],
          },
        })
        .start()
        .completed();
    });
  });
});
