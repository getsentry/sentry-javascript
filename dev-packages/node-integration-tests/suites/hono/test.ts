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

const ROUTE_NAME_CASES: Array<{ method: 'get' | 'post'; path: string; name: string; route: string }> = [
  { method: 'get', path: '/users/me', name: 'GET /users/me', route: '/users/me' },
  { method: 'get', path: '/users/42', name: 'GET /users/:id', route: '/users/:id' },
  { method: 'get', path: '/users/42/posts', name: 'GET /users/*', route: '/users/*' },
  { method: 'get', path: '/overlap/123', name: 'GET /overlap/:id', route: '/overlap/:id' },
  { method: 'get', path: '/early/1', name: 'GET /early/:id', route: '/early/:id' },
  { method: 'get', path: '/posts/1', name: 'GET /posts/:id', route: '/posts/:id' },
  { method: 'get', path: '/posts/draft', name: 'GET /posts/*', route: '/posts/*' },
  { method: 'get', path: '/mw-only/anything', name: 'GET /mw-only/*', route: '/mw-only/*' },
  { method: 'get', path: '/sub/hello', name: 'GET /sub/hello', route: '/sub/hello' },
  {
    method: 'get',
    path: '/test-basepath-mw/hello',
    name: 'GET /test-basepath-mw/hello',
    route: '/test-basepath-mw/hello',
  },
  { method: 'post', path: '/any-method', name: 'POST /any-method', route: '/any-method' },
  { method: 'get', path: '/outer/self-watering-plant', name: 'GET /outer/:itemId', route: '/outer/:itemId' },
];

function segmentNamed(name: string, route: string): { span: (container: { items: StreamedSpan[] }) => void } {
  return {
    span: container => {
      const segment = container.items.find(item => item.is_segment && item.name === name);
      if (!segment) {
        throw new Error(`segment for \`${name}\` not in this container`);
      }
      expect(op(segment)).toBe('http.server');
      expect(attr(segment, 'http.route')).toBe(route);
      expect(attr(segment, 'sentry.segment.name.source')).toBe('route');
    },
  };
}

describe('hono auto-instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    // All cases in one test, because each `test()` starts its own Node process.
    test('names each request after the route of the handler that responded', async () => {
      const runner = createRunner().unordered();
      for (const { name, route } of ROUTE_NAME_CASES) {
        runner.expect(segmentNamed(name, route));
      }

      const started = runner.start();
      for (const { method, path } of ROUTE_NAME_CASES) {
        await started.makeRequest(method, path);
      }
      await started.completed();
    });

    test('names an event captured in a route handler after that route', async () => {
      const runner = createRunner()
        .ignore('span')
        .expect({ event: { message: 'Message from a route handler', transaction: 'GET /users/:id/capture' } })
        .start();
      runner.makeRequest('get', '/users/42/capture');
      await runner.completed();
    });

    test('does not rename a span that a middleware starts around the route handler', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          span: container => {
            const segment = container.items.find(item => item.is_segment && item.name === 'GET /traced/:id');
            if (!segment) {
              throw new Error('segment for `GET /traced/:id` not in this container');
            }
            expect(container.items.filter(item => item.name === 'user span')).toHaveLength(1);
          },
        })
        .start();
      runner.makeRequest('get', '/traced/1');
      await runner.completed();
    });

    test('keeps the runtime name for a request without a route', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          span: container => {
            const segment = container.items.find(
              item => item.is_segment && attr(item, 'url.path') === '/does-not-exist',
            );
            if (!segment) {
              throw new Error('segment for `/does-not-exist` not in this container');
            }
            expect(segment.name).toBe('GET');
            expect(attr(segment, 'sentry.segment.name.source')).toBe('url');
            expect(attr(segment, 'http.route')).toBeUndefined();
          },
        })
        .start();
      runner.makeRequest('get', '/does-not-exist', { expectError: true });
      await runner.completed();
    });

    test('names an event from the route handler that runs after next() after that route', async () => {
      const runner = createRunner()
        .ignore('span')
        .expect({ event: { message: 'Message from a route handler after next()', transaction: 'GET /posts/*' } })
        .start();
      runner.makeRequest('get', '/posts/draft');
      await runner.completed();
    });

    test('names a HEAD request after the GET route', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          event: {
            exception: { values: [{ value: 'Test error from a HEAD request' }] },
            transaction: 'HEAD /head-error/:id',
          },
        })
        .start();
      runner.makeRequest('head', '/head-error/1', { expectError: true });
      await runner.completed();
    });

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

    test('does not wrap a route handler declared with an unused next param as middleware', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          span: container => {
            const segment = container.items.find(item => item.is_segment && item.name === 'GET /arity-two-handler');
            if (!segment) {
              throw new Error('segment for `GET /arity-two-handler` not in this container');
            }
            // The arity-2 handler is the route handler (last in its method+path group), so it must not
            // produce a middleware span.
            const middlewareSpans = container.items.filter(item => op(item) === 'middleware');
            expect(middlewareSpans).toHaveLength(0);
          },
        })
        .start();
      runner.makeRequest('get', '/arity-two-handler');
      await runner.completed();
    });

    test('creates a middleware span for .use() on a .basePath() clone', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          span: container => {
            const segment = container.items.find(
              item => item.is_segment && item.name === 'GET /test-basepath-mw/hello',
            );
            if (!segment) {
              throw new Error('segment for `GET /test-basepath-mw/hello` not in this container');
            }
            const middlewareSpan = container.items.find(
              item => op(item) === 'middleware' && item.name === 'basepathMiddleware',
            );
            expect(middlewareSpan).toBeDefined();
            expect(attr(middlewareSpan!, 'sentry.origin')).toBe('auto.middleware.hono');
          },
        })
        .start();
      runner.makeRequest('get', '/test-basepath-mw/hello');
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

    test('does not set the middleware span to error for a 3xx middleware error', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          span: container => {
            const middlewareSpan = container.items.find(
              item => op(item) === 'middleware' && item.name === 'throwingMiddleware',
            );
            if (!middlewareSpan) {
              throw new Error('middleware span `throwingMiddleware` not in this container');
            }
            expect(middlewareSpan.status).not.toBe('error');
          },
        })
        .start();
      runner.makeRequest('get', '/mw-throw/301', { expectError: true });
      await runner.completed();
    });

    test('does not set the middleware span to error for a 4xx middleware error', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          span: container => {
            const middlewareSpan = container.items.find(
              item => op(item) === 'middleware' && item.name === 'throwingMiddleware',
            );
            if (!middlewareSpan) {
              throw new Error('middleware span `throwingMiddleware` not in this container');
            }
            expect(middlewareSpan.status).not.toBe('error');
          },
        })
        .start();
      runner.makeRequest('get', '/mw-throw/404', { expectError: true });
      await runner.completed();
    });

    test('sets the middleware span to error for a 5xx middleware error', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          span: container => {
            const middlewareSpan = container.items.find(
              item => op(item) === 'middleware' && item.name === 'throwingMiddleware',
            );
            if (!middlewareSpan) {
              throw new Error('middleware span `throwingMiddleware` not in this container');
            }
            expect(middlewareSpan.status).toBe('error');
          },
        })
        .start();
      runner.makeRequest('get', '/mw-throw/503', { expectError: true });
      await runner.completed();
    });
  });
});

describe('hono auto-instrumentation with honoMiddleware(app)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario-honoMiddleware.mjs', 'instrument.mjs', (createRunner, test) => {
    test('wraps route handlers only when one declares next, and only once', async () => {
      const runner = createRunner()
        .unordered()
        .expect(segmentNamed('GET /users/me', '/users/me'))
        .expect(segmentNamed('GET /posts/:id', '/posts/:id'))
        .expect(segmentNamed('GET /posts/:id', '/posts/:id'))
        .expect(segmentNamed('GET /posts/*', '/posts/*'))
        .start();

      expect(await runner.makeRequest('get', '/users/me')).toEqual({ wrappers: 0 });
      // The second request gets the same cached handler list.
      expect(await runner.makeRequest('get', '/posts/1')).toEqual({ wrappers: 1 });
      expect(await runner.makeRequest('get', '/posts/1')).toEqual({ wrappers: 1 });
      expect(await runner.makeRequest('get', '/posts/draft')).toEqual({ wrappers: 1 });
      await runner.completed();
    });
  });
});
