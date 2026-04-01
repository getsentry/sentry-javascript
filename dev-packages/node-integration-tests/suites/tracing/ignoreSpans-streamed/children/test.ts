import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP } from '@sentry/core';

describe('filtering child spans with ignoreSpans (streaming)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
    test('child spans are dropped and remaining spans correctly parented', async () => {
      const runner = createRunner()
        .unignore('client_report')
        .expect({
          client_report: {
            discarded_events: [
              {
                category: 'span',
                quantity: 4,
                reason: 'ignored',
              },
            ],
          },
        })
        .expect({
          span: container => {
            // 5 spans: 1 root, 2 middleware, 1 request handler, 1 custom
            // Would be 7 if we didn't ignore the 'middleware - expressInit' and 'custom-to-drop' spans
            expect(container.items).toHaveLength(5);
            const getSpan = (name: string, op: string) =>
              container.items.find(
                item => item.name === name && item.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_OP]?.value === op,
              );
            const queryMiddlewareSpan = getSpan('query', 'middleware.express');
            const corsMiddlewareSpan = getSpan('corsMiddleware', 'middleware.express');
            const requestHandlerSpan = getSpan('/test/express', 'request_handler.express');
            const httpServerSpan = getSpan('GET /test/express', 'http.server');
            const customSpan = getSpan('custom', 'custom');

            expect(queryMiddlewareSpan).toBeDefined();
            expect(corsMiddlewareSpan).toBeDefined();
            expect(requestHandlerSpan).toBeDefined();
            expect(httpServerSpan).toBeDefined();
            expect(customSpan).toBeDefined();

            expect(customSpan?.parent_span_id).toBe(requestHandlerSpan?.span_id);
            expect(requestHandlerSpan?.parent_span_id).toBe(httpServerSpan?.span_id);
            expect(queryMiddlewareSpan?.parent_span_id).toBe(httpServerSpan?.span_id);
            expect(corsMiddlewareSpan?.parent_span_id).toBe(httpServerSpan?.span_id);
            expect(httpServerSpan?.parent_span_id).toBeUndefined();
          },
        })
        .start();

      runner.makeRequest('get', '/test/express');

      await runner.completed();
    });
  });
});
