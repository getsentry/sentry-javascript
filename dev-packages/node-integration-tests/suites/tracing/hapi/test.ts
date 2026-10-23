import {
  HAPI_EXT_TYPE,
  HAPI_TYPE,
  HTTP_REQUEST_METHOD,
  SENTRY_OP,
  SERVER_EXT_TYPE,
} from '@sentry/conventions/attributes';
import { ROUTER } from '@sentry/conventions/op';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('hapi auto-instrumentation', () => {
  afterAll(async () => {
    cleanupChildProcesses();
  });

  const origin = 'auto.http.hapi';

  const EXPECTED_ERROR_EVENT = {
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Sentry Test Error',
        },
      ],
    },
  };

  const MULTI_METHOD_REQUESTS = [
    { method: 'get', path: '/multi' },
    { method: 'post', path: '/multi' },
    { method: 'put', path: '/wildcard' },
  ] as const;

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should record the request method for multi-method and wildcard routes.', async () => {
      const runner = createRunner().unordered();
      for (const { method, path } of MULTI_METHOD_REQUESTS) {
        const httpMethod = method.toUpperCase();
        runner.expect({
          span: container => {
            expect(container.items.find(item => item.is_segment)?.name).toBe(`${httpMethod} ${path}`);

            const routerSpans = container.items.filter(item => item.attributes[SENTRY_OP]?.value === ROUTER);
            expect(routerSpans).toHaveLength(1);
            expect(routerSpans[0]?.name).toBe(path);
            expect(routerSpans[0]?.attributes[HTTP_REQUEST_METHOD]).toEqual({ type: 'string', value: httpMethod });
          },
        });
      }

      const started = runner.start();
      for (const { method, path } of MULTI_METHOD_REQUESTS) {
        await started.makeRequest(method, path);
      }
      await started.completed();
    });

    test('should auto-instrument `@hapi/hapi` package.', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            expect(container.items.find(item => item.is_segment)?.name).toBe('GET /');

            // Router spans are named after the route alone, without the `GET ` prefix.
            expect(container.items).toContainEqual(
              expect.objectContaining({
                name: '/',
                status: 'ok',
                attributes: expect.objectContaining({
                  'http.route': { type: 'string', value: '/' },
                  'http.request.method': { type: 'string', value: 'GET' },
                  'hapi.type': { type: 'string', value: 'router' },
                  'sentry.origin': { type: 'string', value: origin },
                  'sentry.op': { type: 'string', value: 'router' },
                }),
              }),
            );
          },
        })
        .start();
      runner.makeRequest('get', '/');
      await runner.completed();
    });

    test('should instrument plugin routes and server extensions.', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            expect(container.items.find(item => item.is_segment)?.name).toBe('GET /plugin-route');

            const handlerSpan = container.items.find(item => item.attributes['sentry.op']?.value === 'handler');
            expect(handlerSpan).toMatchObject({
              // The route alone, without the `GET ` prefix the static name carried.
              name: '/plugin-route',
              attributes: expect.objectContaining({
                // The name has to stay in step with the attribute it comes from.
                'http.route': { type: 'string', value: '/plugin-route' },
                'hapi.type': { type: 'string', value: 'plugin' },
                'hapi.plugin.name': { type: 'string', value: 'testPlugin' },
                'sentry.op': { type: 'string', value: 'handler' },
                'sentry.origin': { type: 'string', value: origin },
              }),
            });

            // Spans of other ops keep their names.
            expect(container.items).toContainEqual(
              expect.objectContaining({
                name: 'ext - onPreResponse',
                attributes: expect.objectContaining({
                  [HAPI_TYPE]: { type: 'string', value: 'server.ext' },
                  [HAPI_EXT_TYPE]: { type: 'string', value: 'onPreResponse' },
                  // oxlint-disable-next-line typescript/no-deprecated
                  [SERVER_EXT_TYPE]: { type: 'string', value: 'onPreResponse' },
                  'sentry.op': { type: 'string', value: 'middleware' },
                  'sentry.origin': { type: 'string', value: origin },
                }),
              }),
            );
          },
        })
        .start();
      runner.makeRequest('get', '/plugin-route');
      await runner.completed();
    });

    test('should handle returned plain errors in routes.', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          span: container => {
            expect(container.items.find(item => item.is_segment)?.name).toBe('GET /error');
          },
        })
        .expect({ event: EXPECTED_ERROR_EVENT })
        .start();
      runner.makeRequest('get', '/error', { expectError: true });
      await runner.completed();
    });

    test('should assign parameterized transactionName to error.', async () => {
      const runner = createRunner()
        .expect({
          event: {
            ...EXPECTED_ERROR_EVENT,
            transaction: 'GET /error/{id}',
          },
        })
        .ignore('span')
        .start();
      runner.makeRequest('get', '/error/123', { expectError: true });
      await runner.completed();
    });

    test('should assign the request method to the transactionName of errors in wildcard routes.', async () => {
      const runner = createRunner()
        .expect({
          event: {
            ...EXPECTED_ERROR_EVENT,
            transaction: 'PUT /wildcard-error',
          },
        })
        .ignore('span')
        .start();
      runner.makeRequest('put', '/wildcard-error', { expectError: true });
      await runner.completed();
    });

    test('should handle returned Boom errors in routes.', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          span: container => {
            expect(container.items.find(item => item.is_segment)?.name).toBe('GET /boom-error');
          },
        })
        .expect({ event: EXPECTED_ERROR_EVENT })
        .start();
      runner.makeRequest('get', '/boom-error', { expectError: true });
      await runner.completed();
    });

    test('should handle promise rejections in routes.', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          span: container => {
            expect(container.items.find(item => item.is_segment)?.name).toBe('GET /promise-error');
          },
        })
        .expect({ event: EXPECTED_ERROR_EVENT })
        .start();
      runner.makeRequest('get', '/promise-error', { expectError: true });
      await runner.completed();
    });
  });

  // Only static spans put the method into the router span name, which crashed for multi-method routes.
  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-static.mjs', (createRunner, test) => {
    test('should name router spans after the request method for multi-method and wildcard routes.', async () => {
      const runner = createRunner().unordered();
      for (const { method, path } of MULTI_METHOD_REQUESTS) {
        const httpMethod = method.toUpperCase();
        const spanName = `${httpMethod} ${path}`;
        runner.expect({
          transaction: transaction => {
            expect(transaction.transaction).toBe(spanName);

            const routerSpans = transaction.spans?.filter(span => span.op === ROUTER) ?? [];
            expect(routerSpans).toHaveLength(1);
            expect(routerSpans[0]?.description).toBe(spanName);
            expect(routerSpans[0]?.data[HTTP_REQUEST_METHOD]).toBe(httpMethod);
          },
        });
      }

      const started = runner.start();
      for (const { method, path } of MULTI_METHOD_REQUESTS) {
        await started.makeRequest(method, path);
      }
      await started.completed();
    });
  });

  // Regression test: a `setupHapiErrorHandler` call before `server.start()` installs the default
  // predicate. The integration's own auto-registration (with a custom `shouldHandleError`) fires later,
  // at `server.start()`, and must still win. The custom predicate drops "Dropped error" (which the
  // default would capture), so only the "Captured error" sentinel should come through — if the default
  // predicate were active, "Dropped error" would be captured first and fail this assertion.
  createEsmAndCjsTests(
    __dirname,
    'scenario-should-handle-error.mjs',
    'instrument-should-handle-error.mjs',
    (createRunner, test) => {
      test('integration `shouldHandleError` overrides an earlier default-valued `setupHapiErrorHandler`', async () => {
        const runner = createRunner()
          .ignore('span')
          .expect({
            event: {
              exception: {
                values: [
                  {
                    type: 'Error',
                    value: 'Captured error',
                  },
                ],
              },
            },
          })
          .start();
        await runner.makeRequest('get', '/dropped', { expectError: true });
        await runner.makeRequest('get', '/captured', { expectError: true });
        await runner.completed();
      });
    },
  );
});
