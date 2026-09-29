import { SDK_VERSION } from '@sentry/core';
import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../node-integration-tests/utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('Hono app captures parametrized errors (Hono SDK on Bun)', async () => {
  const runner = createRunner(__dirname, 'index.ts')
    .withMockSentryServer()
    .unordered()
    .expect({
      span: container => {
        const segmentSpan = container.items.find(span => span.is_segment);

        expect(segmentSpan).toMatchObject({
          name: 'GET /error/:param',
          is_segment: true,
          span_id: expect.any(String),
          trace_id: expect.any(String),
          status: 'error',
          attributes: expect.objectContaining({
            'sentry.op': { value: 'http.server', type: 'string' },
            'sentry.origin': { value: 'auto.http.bun.serve', type: 'string' },
            'sentry.segment.name.source': { value: 'route', type: 'string' },
            'http.route': { value: '/error/:param', type: 'string' },
            'http.request.method': { value: 'GET', type: 'string' },
            'http.response.status_code': { value: 500, type: 'integer' },
            'url.path': { value: '/error/param-123', type: 'string' },
          }),
        });
      },
    })
    .expect({
      event: {
        level: 'error',
        transaction: 'GET /error/:param',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test error from Hono app',
              stacktrace: {
                frames: expect.any(Array),
              },
              mechanism: { type: 'auto.http.hono.context_error', handled: false },
            },
          ],
        },
        request: {
          cookies: {},
          headers: expect.any(Object),
          method: 'GET',
          url: expect.stringContaining('/error/param-123'),
        },
        user: { ip_address: expect.any(String) },
        // The runner reads the server port from a `console.log`, which adds a console breadcrumb too.
        breadcrumbs: expect.arrayContaining([
          {
            timestamp: expect.any(Number),
            category: 'console',
            level: 'error',
            message: 'Error: Test error from Hono app',
            data: expect.objectContaining({
              logger: 'console',
              arguments: [{ message: 'Test error from Hono app', name: 'Error', stack: expect.any(String) }],
            }),
          },
        ]),
        sdk: expect.objectContaining({
          name: 'sentry.javascript.hono',
          packages: [
            { name: 'npm:@sentry/hono', version: SDK_VERSION },
            { name: 'npm:@sentry/bun', version: SDK_VERSION },
          ],
        }),
        contexts: expect.objectContaining({
          runtime: { name: 'bun', version: expect.any(String) },
        }),
      },
    })
    .start();

  await runner.makeRequest('get', '/error/param-123', { expectError: true });
  await runner.completed();
});

test('sends the Hono error with the transaction name in the trace envelope header', async () => {
  const runner = createRunner(__dirname, 'index.ts')
    .withMockSentryServer()
    .ignore('span')
    .expectHeader({
      event: {
        sdk: { name: 'sentry.javascript.hono', version: SDK_VERSION },
        trace: expect.objectContaining({
          environment: 'production',
          public_key: 'public',
          trace_id: expect.stringMatching(/^[\da-f]{32}$/),
          sampled: 'true',
          sample_rand: expect.stringMatching(/^[01](\.\d+)?$/),
          transaction: 'GET /error/:param',
        }),
      },
    })
    .start();

  await runner.makeRequest('get', '/error/param-123', { expectError: true });
  await runner.completed();
});

test('Hono app captures parametrized route names on Bun', async () => {
  const runner = createRunner(__dirname, 'index.ts')
    .withMockSentryServer()
    .expect({
      span: container => {
        const segmentSpan = container.items.find(span => span.is_segment);

        expect(segmentSpan).toMatchObject({
          name: 'GET /hello/:name',
          is_segment: true,
          span_id: expect.stringMatching(/^[\da-f]{16}$/),
          trace_id: expect.stringMatching(/^[\da-f]{32}$/),
          status: 'ok',
          attributes: expect.objectContaining({
            'sentry.op': { value: 'http.server', type: 'string' },
            'sentry.origin': { value: 'auto.http.bun.serve', type: 'string' },
            'sentry.segment.name.source': { value: 'route', type: 'string' },
            'http.route': { value: '/hello/:name', type: 'string' },
            'http.request.method': { value: 'GET', type: 'string' },
            'url.path': { value: '/hello/world', type: 'string' },
          }),
        });
      },
    })
    .start();

  await runner.makeRequest('get', '/hello/world');
  await runner.completed();
});
