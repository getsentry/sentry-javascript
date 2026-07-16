import { afterAll, describe, expect } from 'vitest';
import { isOrchestrionEnabled } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('koa auto-instrumentation', () => {
  afterAll(async () => {
    cleanupChildProcesses();
  });

  // `createEsmAndCjsTests` auto-runs this suite with orchestrion on CI. The
  // orchestrion path keeps span ops/attributes identical to the OTel path; only
  // the origin differs to signal the injection mechanism, so we branch on
  // `isOrchestrionEnabled()`.
  const origin = isOrchestrionEnabled() ? 'auto.http.orchestrion.koa' : 'auto.http.otel.koa';

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

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('should auto-instrument `koa` router and middleware layers.', async () => {
      const runner = createRunner()
        .expect({
          transaction: {
            transaction: 'GET /',
            spans: expect.arrayContaining([
              // Router layer span (from `@koa/router`), carrying the matched route.
              expect.objectContaining({
                description: '/',
                op: 'router.koa',
                origin,
                data: expect.objectContaining({
                  'http.route': '/',
                  'koa.type': 'router',
                  'koa.name': '/',
                  'sentry.op': 'router.koa',
                  'sentry.origin': origin,
                }),
              }),
              // Plain middleware span.
              expect.objectContaining({
                description: 'simpleMiddleware',
                op: 'middleware.koa',
                origin,
                data: expect.objectContaining({
                  'koa.type': 'middleware',
                  'koa.name': 'simpleMiddleware',
                  'code.function.name': 'simpleMiddleware',
                  'sentry.op': 'middleware.koa',
                  'sentry.origin': origin,
                }),
              }),
            ]),
          },
        })
        .start();
      runner.makeRequest('get', '/');
      await runner.completed();
    });

    test('should assign a parameterized transaction name.', async () => {
      const runner = createRunner()
        .expect({
          transaction: {
            transaction: 'GET /test-param/:id',
            spans: expect.arrayContaining([
              expect.objectContaining({
                description: '/test-param/:id',
                op: 'router.koa',
                origin,
                data: expect.objectContaining({
                  'http.route': '/test-param/:id',
                  'koa.type': 'router',
                  'koa.name': '/test-param/:id',
                  'sentry.op': 'router.koa',
                  'sentry.origin': origin,
                }),
              }),
            ]),
          },
        })
        .start();
      runner.makeRequest('get', '/test-param/123');
      await runner.completed();
    });

    test('should capture errors thrown in routes via the koa error handler.', async () => {
      const runner = createRunner()
        .unordered()
        .expect({ transaction: { transaction: 'GET /error' } })
        .expect({ event: EXPECTED_ERROR_EVENT })
        .start();
      runner.makeRequest('get', '/error', { expectError: true });
      await runner.completed();
    });
  });
});
