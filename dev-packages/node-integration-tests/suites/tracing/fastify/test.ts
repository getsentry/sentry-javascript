import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('fastify auto-instrumentation', () => {
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
                op: 'hook.fastify',
                origin: 'auto.http.otel.fastify',
                data: expect.objectContaining({
                  'fastify.type': 'hook',
                  'sentry.op': 'hook.fastify',
                  'sentry.origin': 'auto.http.otel.fastify',
                }),
              }),
              expect.objectContaining({
                op: 'request_handler.fastify',
                origin: 'auto.http.otel.fastify',
                data: expect.objectContaining({
                  'sentry.op': 'request_handler.fastify',
                  'sentry.origin': 'auto.http.otel.fastify',
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
});
