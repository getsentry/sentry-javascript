import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createCjsTests } from '../../../utils/runner';

describe('express error handling', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('tracesSampleRate: 1', () => {
    createCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
      test('should capture and send Express controller error with txn name if tracesSampleRate is 1', async () => {
        const runner = createRunner()
          .unordered()
          .expect({
            transaction: {
              transaction: 'GET /test/express/:id',
              contexts: {
                trace: {
                  op: 'http.server',
                  status: 'internal_error',
                  data: expect.objectContaining({
                    'http.response.status_code': 500,
                  }),
                },
              },
            },
          })
          .expect({
            event: {
              exception: {
                values: [
                  {
                    mechanism: {
                      type: 'auto.http.express',
                      handled: false,
                    },
                    type: 'Error',
                    value: 'test_error with id 123',
                    stacktrace: {
                      frames: expect.arrayContaining([
                        expect.objectContaining({
                          function: expect.any(String),
                          lineno: expect.any(Number),
                          colno: expect.any(Number),
                        }),
                      ]),
                    },
                  },
                ],
              },
              transaction: 'GET /test/express/:id',
            },
          })
          .start();
        runner.makeRequest('get', '/test/express/123', { expectError: true });
        await runner.completed();
      });
    });
  });

  describe('tracesSampleRate: 0', () => {
    createCjsTests(__dirname, 'scenario.mjs', 'instrument-sample-rate-0.mjs', (createRunner, test) => {
      test('should capture and send Express controller error with txn name if tracesSampleRate is 0', async () => {
        const runner = createRunner()
          .expect({
            event: {
              exception: {
                values: [
                  {
                    mechanism: {
                      type: 'auto.http.express',
                      handled: false,
                    },
                    type: 'Error',
                    value: 'test_error with id 123',
                    stacktrace: {
                      frames: expect.arrayContaining([
                        expect.objectContaining({
                          function: expect.any(String),
                          lineno: expect.any(Number),
                          colno: expect.any(Number),
                        }),
                      ]),
                    },
                  },
                ],
              },
              transaction: 'GET /test/express/:id',
            },
          })
          .start();
        runner.makeRequest('get', '/test/express/123', { expectError: true });
        await runner.completed();
      });
    });
  });

  describe('without tracing', () => {
    createCjsTests(__dirname, 'scenario.mjs', 'instrument-no-tracing.mjs', (createRunner, test) => {
      test('should capture and send Express controller error if tracesSampleRate is not set.', async () => {
        const runner = createRunner()
          .ignore('transaction')
          .expect({
            event: {
              exception: {
                values: [
                  {
                    mechanism: {
                      type: 'auto.http.express',
                      handled: false,
                    },
                    type: 'Error',
                    value: 'test_error with id 123',
                    stacktrace: {
                      frames: expect.arrayContaining([
                        expect.objectContaining({
                          function: expect.any(String),
                          lineno: expect.any(Number),
                          colno: expect.any(Number),
                        }),
                      ]),
                    },
                  },
                ],
              },
            },
          })
          .start();

        runner.makeRequest('get', '/test/express/123', { expectError: true });
        await runner.completed();
      });

      /**
       * Why does this test exist?
       *
       * We recently discovered that errors caught by global handlers will potentially loose scope data from the active scope
       * where the error was originally thrown in. The simple example in this test (see scenario.mjs) demonstrates this behavior
       * (in a Node environment but the same behavior applies to the browser; see the test there).
       *
       * This test nevertheless covers the behavior so that we're aware.
       */
      test('withScope scope is NOT applied to thrown error caught by global handler', async () => {
        const runner = createRunner()
          .expect({
            event: {
              exception: {
                values: [
                  {
                    mechanism: {
                      type: 'auto.http.express',
                      handled: false,
                    },
                    type: 'Error',
                    value: 'test_error',
                    stacktrace: {
                      frames: expect.arrayContaining([
                        expect.objectContaining({
                          function: expect.any(String),
                          lineno: expect.any(Number),
                          colno: expect.any(Number),
                        }),
                      ]),
                    },
                  },
                ],
              },
              // 'local' tag is not applied to the event
              tags: expect.not.objectContaining({ local: expect.anything() }),
            },
          })
          .start();

        runner.makeRequest('get', '/test/withScope', { expectError: true });

        await runner.completed();
      });

      /**
       * This test shows that the isolation scope set tags are applied correctly to the error.
       */
      test('http requestisolation scope is applied to thrown error caught by global handler', async () => {
        const runner = createRunner()
          .expect({
            event: {
              exception: {
                values: [
                  {
                    mechanism: {
                      type: 'auto.http.express',
                      handled: false,
                    },
                    type: 'Error',
                    value: 'isolation_test_error',
                    stacktrace: {
                      frames: expect.arrayContaining([
                        expect.objectContaining({
                          function: expect.any(String),
                          lineno: expect.any(Number),
                          colno: expect.any(Number),
                        }),
                      ]),
                    },
                  },
                ],
              },
              tags: {
                global: 'tag',
                'isolation-scope': 'tag',
              },
            },
          })
          .start();

        runner.makeRequest('get', '/test/isolationScope', { expectError: true });

        await runner.completed();
      });

      /**
       * This test shows that an inner isolation scope, created via `withIsolationScope`, is not applied to the error.
       *
       * This behaviour occurs because, just like in the test above where we use `getIsolationScope().setTag`,
       * this isolation scope again is only valid as long as we're in the callback.
       *
       * So why _does_ the http isolation scope get applied then? Because express' error handler applies on
       * a per-request basis, meaning, it's called while we're inside the isolation scope of the http request,
       * created from our `httpIntegration`.
       */
      test('withIsolationScope scope is NOT applied to thrown error caught by global handler', async () => {
        const runner = createRunner()
          .expect({
            event: {
              exception: {
                values: [
                  {
                    mechanism: {
                      type: 'auto.http.express',
                      handled: false,
                    },
                    type: 'Error',
                    value: 'with_isolation_scope_test_error',
                    stacktrace: {
                      frames: expect.arrayContaining([
                        expect.objectContaining({
                          function: expect.any(String),
                          lineno: expect.any(Number),
                          colno: expect.any(Number),
                        }),
                      ]),
                    },
                  },
                ],
              },
              // 'with-isolation-scope' tag is not applied to the event
              tags: expect.not.objectContaining({ 'with-isolation-scope': expect.anything() }),
            },
          })
          .start();

        runner.makeRequest('get', '/test/withIsolationScope', { expectError: true });

        await runner.completed();
      });
    });
  });

  describe('expressIntegration shouldHandleError option', () => {
    createCjsTests(
      __dirname,
      'scenario-should-handle-error.mjs',
      'instrument-should-handle-error.mjs',
      (createRunner, test) => {
        test('captures only errors for which shouldHandleError returns true', async () => {
          const runner = createRunner()
            .expect({
              event: {
                exception: {
                  values: [
                    {
                      value: 'error_2',
                    },
                  ],
                },
              },
            })
            .start();

          // this error is filtered & ignored
          runner.makeRequest('get', '/test1', { expectError: true });
          // this error is actually captured
          runner.makeRequest('get', '/test2', { expectError: true });

          await runner.completed();
        });
      },
    );
  });

  describe('setupExpressErrorHandler', () => {
    // Precedence: with both the channel-based integration and the deprecated middleware present, the
    // integration is the single registered handler. Its `shouldHandleError` (error_2 only) decides
    // what is captured (mechanism `auto.http.express`), so `error_1` is dropped even though the
    // deprecated middleware's default predicate would capture it, and `error_2` is captured once.
    createCjsTests(
      __dirname,
      'scenario-setup-error-handler.mjs',
      'instrument-should-handle-error.mjs',
      (createRunner, test) => {
        test('expressIntegration takes precedence over the deprecated handler', async () => {
          const runner = createRunner()
            .expect({
              event: {
                exception: {
                  values: [
                    {
                      mechanism: {
                        type: 'auto.http.express',
                        handled: false,
                      },
                      value: 'error_2',
                    },
                  ],
                },
              },
            })
            .start();

          // dropped by the integration's shouldHandleError; the deprecated handler must NOT capture it either
          runner.makeRequest('get', '/test1', { expectError: true });
          // captured once, by the integration
          runner.makeRequest('get', '/test2', { expectError: true });

          await runner.completed();
        });
      },
    );

    // Fallback: with `expressIntegration` disabled, the deprecated middleware is the sole capturer
    // (mechanism `auto.middleware.express`). It applies the default predicate — `shouldHandleError`
    // is configured on `expressIntegration` only.
    createCjsTests(
      __dirname,
      'scenario-setup-error-handler-fallback.mjs',
      'instrument-setup-error-handler.mjs',
      (createRunner, test) => {
        test('deprecated handler captures with the default predicate when expressIntegration is disabled', async () => {
          const runner = createRunner()
            .expect({
              event: {
                exception: {
                  values: [
                    {
                      mechanism: {
                        type: 'auto.middleware.express',
                        handled: false,
                      },
                      value: 'error_2',
                    },
                  ],
                },
              },
            })
            .start();

          // 4xx: skipped by the default predicate
          runner.makeRequest('get', '/test1', { expectError: true });
          // no status: treated as 5xx and captured
          runner.makeRequest('get', '/test2', { expectError: true });

          await runner.completed();
        });
      },
    );
  });
});
