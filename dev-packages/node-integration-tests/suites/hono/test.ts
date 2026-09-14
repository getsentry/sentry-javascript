import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../utils/runner';

// Verifies that Hono is auto-instrumented out of the box by `@sentry/node` (the `honoIntegration`
// default), without importing `@sentry/hono` or registering the `sentry()` middleware manually.
describe('hono auto-instrumentation (Node)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates a transaction for a basic GET request', async () => {
      const runner = createRunner()
        .expect({
          transaction: {
            transaction: 'GET /',
            contexts: {
              trace: {
                op: 'http.server',
                status: 'ok',
              },
            },
          },
        })
        .start();
      runner.makeRequest('get', '/');
      await runner.completed();
    });

    test('creates a transaction with a parametrized route name', async () => {
      const runner = createRunner()
        .expect({
          transaction: {
            transaction: 'GET /hello/:name',
            transaction_info: {
              source: 'route',
            },
            contexts: {
              trace: {
                op: 'http.server',
                status: 'ok',
              },
            },
          },
        })
        .start();
      runner.makeRequest('get', '/hello/world');
      await runner.completed();
    });

    test('captures an error with the correct mechanism', async () => {
      const runner = createRunner()
        .ignore('transaction')
        .expect({
          event: {
            exception: {
              values: [
                {
                  type: 'Error',
                  value: 'Test error from Hono app',
                  mechanism: {
                    type: 'auto.http.hono.context_error',
                    handled: false,
                  },
                },
              ],
            },
            transaction: 'GET /error/:param',
          },
        })
        .start();
      runner.makeRequest('get', '/error/param-123', { expectError: true });
      await runner.completed();
    });

    test('creates a transaction with internal_error status when an error occurs', async () => {
      const runner = createRunner()
        .ignore('event')
        .expect({
          transaction: {
            transaction: 'GET /error/:param',
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
        .start();
      runner.makeRequest('get', '/error/param-456', { expectError: true });
      await runner.completed();
    });

    test('does not create a middleware span for the Sentry middleware in a mounted sub-app', async () => {
      const runner = createRunner()
        .expect({
          transaction: transaction => {
            expect(transaction.transaction).toBe('GET /sub/hello');
            const middlewareSpans = (transaction.spans || []).filter(span => span.op === 'middleware');
            const names = middlewareSpans.map(span => span.description);
            // The sub-app's user middleware is traced …
            expect(names).toContain('subMiddleware');
            // … but the sub-app's own auto-registered Sentry middleware must not appear as a span
            // (it is copied into the parent at mount time and must stay unwrapped).
            expect(names).not.toContain('<anonymous>');
          },
        })
        .start();
      runner.makeRequest('get', '/sub/hello');
      await runner.completed();
    });

    test('traces an internal .request() call without the inner app re-instrumenting the request', async () => {
      const runner = createRunner()
        .expect({
          transaction: transaction => {
            // The transaction is named after the outer route, not the internal one.
            expect(transaction.transaction).toBe('GET /outer/:itemId');

            const spans = transaction.spans || [];

            // The internal dispatch is traced with the raw inner path — the inner app's Sentry
            // middleware must not re-name it to the parametrized route.
            const internalRequestSpans = spans.filter(span => span.origin === 'auto.http.hono.internal_request');
            expect(internalRequestSpans).toHaveLength(1);
            expect(internalRequestSpans[0]?.description).toBe('GET /item/self-watering-plant');

            // The inner app's Sentry middleware must not add a middleware span.
            const middlewareNames = spans.filter(span => span.op === 'middleware').map(span => span.description);
            expect(middlewareNames).not.toContain('<anonymous>');
          },
        })
        .start();
      runner.makeRequest('get', '/outer/self-watering-plant');
      await runner.completed();
    });

    test('captures an error thrown after an internal .request() with the outer request data', async () => {
      const runner = createRunner()
        .ignore('transaction')
        .expect({
          event: event => {
            expect(event.exception?.values?.[0]?.value).toBe('Test error from outer Hono app after internal request');
            // The internal `.request()` dispatch must not overwrite the request data with its own URL.
            expect(event.request?.url).toContain('/outer-error/self-watering-plant');
            expect(event.request?.url).not.toContain('/item/');
          },
        })
        .start();
      runner.makeRequest('get', '/outer-error/self-watering-plant', { expectError: true });
      await runner.completed();
    });
  });
});
