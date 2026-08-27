import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('fastify v5 auto-instrumentation', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates transaction with fastify hook, request-handler and manual spans', async () => {
      const runner = createRunner()
        .expect({
          transaction: {
            transaction: 'GET /test-transaction',
            spans: expect.arrayContaining([
              expect.objectContaining({
                op: 'middleware',
                origin: 'auto.http.fastify',
                data: expect.objectContaining({
                  'fastify.type': 'hook',
                  'sentry.op': 'middleware',
                  'sentry.origin': 'auto.http.fastify',
                }),
              }),
              // Route-level hooks have no `op`, so the span name falls back to `${hook} - ${handler}`
              // using the original hook identifier (not the prefixed `hook.name` attribute).
              expect.objectContaining({
                description: 'preHandler - routePreHandler',
                origin: 'auto.http.fastify',
                data: expect.objectContaining({
                  'fastify.type': 'route-hook',
                  'hook.callback.name': 'routePreHandler',
                  'sentry.origin': 'auto.http.fastify',
                }),
              }),
              expect.objectContaining({
                op: 'handler',
                origin: 'auto.http.fastify',
                data: expect.objectContaining({
                  'sentry.op': 'handler',
                  'sentry.origin': 'auto.http.fastify',
                }),
              }),
              expect.objectContaining({
                description: 'test-span',
                origin: 'manual',
              }),
              expect.objectContaining({
                description: 'child-span',
                origin: 'manual',
              }),
            ]),
          },
        })
        .start();
      runner.makeRequest('get', '/test-transaction');
      await runner.completed();
    });

    test('captures errors thrown in route handlers', async () => {
      const runner = createRunner()
        .ignore('transaction')
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

  createEsmAndCjsTests(__dirname, 'scenario-error-handler.mjs', 'instrument.mjs', (createRunner, test) => {
    test('shouldHandleError override works', async () => {
      const runner = createRunner()
        .ignore('transaction')
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
  });

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
