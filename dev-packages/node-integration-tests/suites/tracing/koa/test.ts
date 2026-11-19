import { afterAll, describe, expect } from 'vitest';
import { SUPPORTS_REQUIRE_OF_ESM } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('koa auto-instrumentation', () => {
  afterAll(async () => {
    cleanupChildProcesses();
  });

  const origin = 'auto.http.koa';

  const EXPECTED_ERROR_EVENT = {
    // The error is captured within the request's koa span, so it keeps its trace
    // linkage (a `parent_span_id`) even though koa emits `error` after the
    // middleware chain has unwound.
    contexts: {
      trace: {
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      },
    },
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Sentry Test Error',
        },
      ],
    },
  };

  describe.each([
    ['v2', {}],
    ['v3', { koa: '^3.0.0' }],
  ])('%s', (version, additionalDependencies) => {
    createEsmAndCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument.mjs',
      (createRunner, test) => {
        // Koa 2 depends on `generator-function`, which `require()`s an ES module.
        const runTest = version === 'v2' ? test.runIf(SUPPORTS_REQUIRE_OF_ESM) : test;
        runTest('should auto-instrument `koa` router and middleware layers.', async () => {
          const runner = createRunner()
            .expect({
              span: container => {
                expect(container.items.find(item => item.is_segment)?.name).toBe('GET /');

                // Router layer span (from `@koa/router`), carrying the matched route.
                expect(container.items).toContainEqual(
                  expect.objectContaining({
                    name: '/',
                    attributes: expect.objectContaining({
                      'http.route': { type: 'string', value: '/' },
                      'koa.type': { type: 'string', value: 'router' },
                      'sentry.op': { type: 'string', value: 'router' },
                      'sentry.origin': { type: 'string', value: origin },
                    }),
                  }),
                );

                // Plain middleware span.
                expect(container.items).toContainEqual(
                  expect.objectContaining({
                    name: 'simpleMiddleware',
                    attributes: expect.objectContaining({
                      'koa.type': { type: 'string', value: 'middleware' },
                      'code.function.name': { type: 'string', value: 'simpleMiddleware' },
                      'sentry.op': { type: 'string', value: 'middleware' },
                      'sentry.origin': { type: 'string', value: origin },
                    }),
                  }),
                );
              },
            })
            .start();
          runner.makeRequest('get', '/');
          await runner.completed();
        });

        runTest('should assign a parameterized segment name.', async () => {
          const runner = createRunner()
            .expect({
              span: container => {
                expect(container.items.find(item => item.is_segment)?.name).toBe('GET /test-param/:id');

                expect(container.items).toContainEqual(
                  expect.objectContaining({
                    name: '/test-param/:id',
                    attributes: expect.objectContaining({
                      'http.route': { type: 'string', value: '/test-param/:id' },
                      'koa.type': { type: 'string', value: 'router' },
                      'sentry.op': { type: 'string', value: 'router' },
                      'sentry.origin': { type: 'string', value: origin },
                    }),
                  }),
                );
              },
            })
            .start();
          runner.makeRequest('get', '/test-param/123');
          await runner.completed();
        });

        runTest('should capture errors thrown in routes via the koa error handler.', async () => {
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
      },
      { additionalDependencies },
    );
  });
});
