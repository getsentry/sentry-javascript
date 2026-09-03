import { afterAll, describe, expect } from 'vitest';
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
                op: 'router',
                origin,
                data: expect.objectContaining({
                  'http.route': '/',
                  'koa.type': 'router',
                  'koa.name': '/',
                  'sentry.op': 'router',
                  'sentry.origin': origin,
                }),
              }),
              // Plain middleware span.
              expect.objectContaining({
                description: 'simpleMiddleware',
                op: 'middleware',
                origin,
                data: expect.objectContaining({
                  'koa.type': 'middleware',
                  'koa.name': 'simpleMiddleware',
                  'code.function.name': 'simpleMiddleware',
                  'sentry.op': 'middleware',
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
                op: 'router',
                origin,
                data: expect.objectContaining({
                  'http.route': '/test-param/:id',
                  'koa.type': 'router',
                  'koa.name': '/test-param/:id',
                  'sentry.op': 'router',
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
