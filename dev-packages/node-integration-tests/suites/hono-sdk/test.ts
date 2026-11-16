import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../utils/runner';

const ROUTE_NAME_CASES: Array<{ method: 'get' | 'post'; path: string; name: string; route: string }> = [
  { method: 'get', path: '/users/me', name: 'GET /users/me', route: '/users/me' },
  { method: 'get', path: '/users/42', name: 'GET /users/:id', route: '/users/:id' },
  { method: 'get', path: '/users/42/posts', name: 'GET /users/*', route: '/users/*' },
  { method: 'get', path: '/early/1', name: 'GET /early/:id', route: '/early/:id' },
  { method: 'get', path: '/posts/1', name: 'GET /posts/:id', route: '/posts/:id' },
  { method: 'get', path: '/posts/draft', name: 'GET /posts/*', route: '/posts/*' },
  { method: 'get', path: '/mw-only/anything', name: 'GET /mw-only/*', route: '/mw-only/*' },
  { method: 'get', path: '/sub/hello', name: 'GET /sub/hello', route: '/sub/hello' },
  { method: 'get', path: '/base/hello', name: 'GET /base/hello', route: '/base/hello' },
  { method: 'post', path: '/any-method', name: 'POST /any-method', route: '/any-method' },
  { method: 'get', path: '/outer/self-watering-plant', name: 'GET /outer/:itemId', route: '/outer/:itemId' },
];

describe('hono-sdk (Node)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    // All cases in one test, because each `test()` starts its own Node process.
    test('names each request after the route of the handler that responded', async () => {
      const runner = createRunner().unordered();
      for (const { name, route } of ROUTE_NAME_CASES) {
        runner.expect({
          span: container => {
            const segment = container.items.find(item => item.is_segment && item.name === name);
            if (!segment) {
              throw new Error(`segment for \`${name}\` not in this container`);
            }
            expect(segment.attributes?.['http.route']).toEqual({ type: 'string', value: route });
            expect(segment.attributes?.['sentry.segment.name.source']).toEqual({ type: 'string', value: 'route' });
          },
        });
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

    test('keeps the runtime name for a request without a route', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            const segment = container.items.find(item => item.is_segment);
            expect(segment?.name).toBe('GET');
            expect(segment?.attributes?.['sentry.segment.name.source']).toEqual({ type: 'string', value: 'url' });
            expect(segment?.attributes?.['url.path']).toEqual({ type: 'string', value: '/does-not-exist' });
            expect(segment?.attributes?.['http.route']).toBeUndefined();
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
        .ignore('span')
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

    test('creates a segment span for a basic GET request', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            expect(container.items.find(item => item.is_segment)).toMatchObject({
              name: 'GET /',
              status: 'ok',
              attributes: expect.objectContaining({
                'sentry.op': { type: 'string', value: 'http.server' },
              }),
            });
          },
        })
        .start();
      runner.makeRequest('get', '/');
      await runner.completed();
    });

    test('creates a segment span with a parametrized route name', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            expect(container.items.find(item => item.is_segment)).toMatchObject({
              name: 'GET /hello/:name',
              status: 'ok',
              attributes: expect.objectContaining({
                'sentry.op': { type: 'string', value: 'http.server' },
                'sentry.segment.name.source': { type: 'string', value: 'route' },
              }),
            });
          },
        })
        .start();
      runner.makeRequest('get', '/hello/world');
      await runner.completed();
    });

    test('captures an error with the correct mechanism', async () => {
      const runner = createRunner()
        .ignore('span')
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

    test('creates a segment span with error status when an error occurs', async () => {
      const runner = createRunner()
        .ignore('event')
        .expect({
          span: container => {
            expect(container.items.find(item => item.is_segment)).toMatchObject({
              name: 'GET /error/:param',
              status: 'error',
              attributes: expect.objectContaining({
                'sentry.op': { type: 'string', value: 'http.server' },
                'sentry.status.message': { type: 'string', value: 'internal_error' },
                'http.response.status_code': { type: 'integer', value: 500 },
              }),
            });
          },
        })
        .start();
      runner.makeRequest('get', '/error/param-456', { expectError: true });
      await runner.completed();
    });
  });
});
