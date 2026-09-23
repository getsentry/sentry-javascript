import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('fastify v5 auto-instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates segment span with fastify hook, request-handler and manual spans', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            expect(container.items.find(item => item.is_segment)?.name).toBe('GET /test-transaction');

            expect(container.items).toContainEqual(
              expect.objectContaining({
                attributes: expect.objectContaining({
                  'fastify.type': { type: 'string', value: 'hook' },
                  'sentry.op': { type: 'string', value: 'middleware' },
                  'sentry.origin': { type: 'string', value: 'auto.http.fastify' },
                }),
              }),
            );

            // Route-level hooks have no `op`, so the span name falls back to `${hook} - ${handler}`
            // using the original hook identifier (not the prefixed `hook.name` attribute).
            expect(container.items).toContainEqual(
              expect.objectContaining({
                name: 'preHandler - routePreHandler',
                attributes: expect.objectContaining({
                  'fastify.type': { type: 'string', value: 'route-hook' },
                  'hook.callback.name': { type: 'string', value: 'routePreHandler' },
                  'sentry.origin': { type: 'string', value: 'auto.http.fastify' },
                }),
              }),
            );

            // The request span and the route handler span are both named after the route.
            const handlerSpans = container.items.filter(item => item.attributes['sentry.op']?.value === 'handler');
            expect(handlerSpans).toHaveLength(2);
            for (const span of handlerSpans) {
              expect(span.name).toBe('/test-transaction');
              // The name has to stay in step with the attribute it comes from.
              expect(span.attributes['http.route']?.value).toBe('/test-transaction');
              expect(span.attributes['sentry.origin']?.value).toBe('auto.http.fastify');
            }

            expect(container.items).toContainEqual(
              expect.objectContaining({
                name: 'test-span',
                attributes: expect.objectContaining({ 'sentry.origin': { type: 'string', value: 'manual' } }),
              }),
            );
            expect(container.items).toContainEqual(
              expect.objectContaining({
                name: 'child-span',
                attributes: expect.objectContaining({ 'sentry.origin': { type: 'string', value: 'manual' } }),
              }),
            );
          },
        })
        .start();
      runner.makeRequest('get', '/test-transaction');
      await runner.completed();
    });

    test('captures errors thrown in route handlers', async () => {
      const runner = createRunner()
        .ignore('span')
        .expect({
          event: {
            exception: {
              values: [
                {
                  type: 'Error',
                  value: 'This is an exception with id 123',
                  mechanism: {
                    type: 'auto.function.fastify',
                    handled: false,
                  },
                },
              ],
            },
            transaction: 'GET /test-exception/:id',
            // The error must be parented to the fastify request span (not the root `http.server` span),
            // so the trace context carries a `parent_span_id`.
            contexts: {
              trace: {
                trace_id: expect.stringMatching(/[a-f0-9]{32}/),
                span_id: expect.stringMatching(/[a-f0-9]{16}/),
                parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
              },
            },
          },
        })
        .start();
      runner.makeRequest('get', '/test-exception/123', { expectError: true });
      await runner.completed();
    });

    test('propagates trace data to outgoing requests within a request handler', async () => {
      const runner = createRunner().start();
      const response = await runner.makeRequest<{ headers: Record<string, string> }>('get', '/test-outgoing-fetch/123');

      expect(response?.headers?.['sentry-trace']).toMatch(/^[a-f0-9]{32}-[a-f0-9]{16}-1$/);
      expect(response?.headers?.['baggage']).toEqual(expect.any(String));
    });
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-error-handler.mjs',
    'instrument-error-handler.mjs',
    (createRunner, test) => {
      test('shouldHandleError override works', async () => {
        const runner = createRunner()
          .ignore('span')
          .expect({
            event: {
              exception: {
                values: [
                  {
                    type: 'Error',
                    value: 'This is an exception with id 123',
                    mechanism: {
                      type: 'auto.function.fastify',
                      handled: false,
                    },
                  },
                ],
              },
              transaction: 'GET /test-exception/:id',
              // The error must be parented to the fastify request span (not the root `http.server` span),
              // so the trace context carries a `parent_span_id`.
              contexts: {
                trace: {
                  trace_id: expect.stringMatching(/[a-f0-9]{32}/),
                  span_id: expect.stringMatching(/[a-f0-9]{16}/),
                  parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
                },
              },
            },
          })
          .start();
        await runner.makeRequest('get', '/test-error-not-captured', { expectError: true });
        await runner.makeRequest('get', '/test-exception/123', { expectError: true });

        await runner.completed();
      });
    },
  );

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-no-tracing.mjs', (createRunner, test) => {
    test('captures errors thrown in route handlers without tracing', async () => {
      const runner = createRunner()
        .expect({
          event: {
            exception: {
              values: [
                {
                  type: 'Error',
                  value: 'This is an exception with id 456',
                  mechanism: {
                    type: 'auto.function.fastify',
                    handled: false,
                  },
                },
              ],
            },
            transaction: 'GET /test-exception/:id',
            // Has no parent_span_id because tracing is disabled
            contexts: {
              trace: {
                trace_id: expect.stringMatching(/[a-f0-9]{32}/),
                span_id: expect.stringMatching(/[a-f0-9]{16}/),
              },
            },
          },
        })
        .start();
      runner.makeRequest('get', '/test-exception/456', { expectError: true });
      await runner.completed();
    });
  });
});
