import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../utils/runner';

// Verifies that Hono is auto-instrumented out of the box by `@sentry/node` (the `honoIntegration`
// default), without importing `@sentry/hono` or registering the `sentry()` middleware manually.
//
// The SDK runs with the default `traceLifecycle` (span streaming), so the transaction is asserted via
// the streamed span container (`container.items`, root = `is_segment`) rather than a `transaction`
// envelope, and `.unordered()` lets the segment/child spans and error events arrive in any order
// while ignoring unrelated envelopes (client reports, etc.).

// oxlint-disable-next-line typescript/no-explicit-any
type StreamedSpan = { name?: string; status?: string; is_segment?: boolean; attributes?: Record<string, any> };

const attr = (span: StreamedSpan, key: string): unknown => span.attributes?.[key]?.value;
const op = (span: StreamedSpan): unknown => attr(span, 'sentry.op');

describe('hono auto-instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates a transaction for a basic GET request', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          span: container => {
            const segment = container.items.find(item => item.is_segment && item.name === 'GET /');
            if (!segment) {
              throw new Error('segment for `GET /` not in this container');
            }
            expect(op(segment)).toBe('http.server');
            expect(segment.status).toBe('ok');
          },
        })
        .start();
      runner.makeRequest('get', '/');
      await runner.completed();
    });

    test('creates a transaction with a parametrized route name', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          span: container => {
            const segment = container.items.find(item => item.is_segment && item.name === 'GET /hello/:name');
            if (!segment) {
              throw new Error('segment for `GET /hello/:name` not in this container');
            }
            expect(op(segment)).toBe('http.server');
            expect(attr(segment, 'sentry.segment.name.source')).toBe('route');
          },
        })
        .start();
      runner.makeRequest('get', '/hello/world');
      await runner.completed();
    });

    test('captures an error with the correct mechanism', async () => {
      const runner = createRunner()
        .unordered()
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
        .unordered()
        .expect({
          span: container => {
            const segment = container.items.find(item => item.is_segment && item.name === 'GET /error/:param');
            if (!segment) {
              throw new Error('segment for `GET /error/:param` not in this container');
            }
            expect(op(segment)).toBe('http.server');
            expect(segment.status).toBe('error');
            expect(attr(segment, 'http.response.status_code')).toBe(500);
          },
        })
        .start();
      runner.makeRequest('get', '/error/param-456', { expectError: true });
      await runner.completed();
    });

    test('does not create a middleware span for the Sentry middleware in a mounted sub-app', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          span: container => {
            const segment = container.items.find(item => item.is_segment && item.name === 'GET /sub/hello');
            if (!segment) {
              throw new Error('segment for `GET /sub/hello` not in this container');
            }
            const middlewareNames = container.items.filter(item => op(item) === 'middleware').map(item => item.name);
            // The sub-app's user middleware is traced …
            expect(middlewareNames).toContain('subMiddleware');
            // … but the sub-app's own auto-registered Sentry middleware must not appear as a span
            // (it is copied into the parent at mount time and must stay unwrapped).
            expect(middlewareNames).not.toContain('<anonymous>');
          },
        })
        .start();
      runner.makeRequest('get', '/sub/hello');
      await runner.completed();
    });

    test('traces an internal .request() call without the inner app re-instrumenting the request', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          span: container => {
            // Transaction is named after the outer route, not the internal one.
            const segment = container.items.find(item => item.is_segment && item.name === 'GET /outer/:itemId');
            if (!segment) {
              throw new Error('segment for `GET /outer/:itemId` not in this container');
            }

            // The internal dispatch is traced with the raw inner path — the inner app's Sentry
            // middleware must not re-name it to the parametrized route.
            const internalRequestSpans = container.items.filter(
              item => attr(item, 'sentry.origin') === 'auto.http.hono.internal_request',
            );
            expect(internalRequestSpans).toHaveLength(1);
            expect(internalRequestSpans[0]?.name).toBe('GET /item/self-watering-plant');

            // The inner app's Sentry middleware must not add a middleware span.
            const middlewareNames = container.items.filter(item => op(item) === 'middleware').map(item => item.name);
            expect(middlewareNames).not.toContain('<anonymous>');
          },
        })
        .start();
      runner.makeRequest('get', '/outer/self-watering-plant');
      await runner.completed();
    });

    test('captures an error thrown inside an internal .request() even when the outer handler degrades to 200', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          event: event => {
            expect(event.exception?.values?.[0]?.value).toBe('inventory db is down');
            expect(event.exception?.values?.[0]?.mechanism).toEqual(
              expect.objectContaining({ type: 'auto.http.hono.context_error', handled: false }),
            );
          },
        })
        .start();
      runner.makeRequest('get', '/degraded/self-watering-plant');
      await runner.completed();
    });

    test('captures an error thrown after an internal .request() with the outer request data', async () => {
      const runner = createRunner()
        .unordered()
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
