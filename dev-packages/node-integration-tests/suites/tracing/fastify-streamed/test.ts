import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('fastify auto-instrumentation (streamed)', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('names request handler spans after their route', async () => {
      const runner = createRunner()
        .expect({
          span: container => {
            const handlerSpans = container.items.filter(item => item.attributes['sentry.op']?.value === 'handler');

            // The request span and the route handler span.
            expect(handlerSpans).toHaveLength(2);
            for (const span of handlerSpans) {
              expect(span.name).toBe('/test-transaction/:id');
              // The name has to stay in step with the attribute it comes from.
              expect(span.attributes['http.route']?.value).toBe('/test-transaction/:id');
            }

            // Spans of other ops keep their names.
            const hookSpan = container.items.find(item => item.name === 'preHandler - routePreHandler');
            expect(hookSpan).toBeDefined();
          },
        })
        .start();

      await runner.makeRequest('get', '/test-transaction/123');

      await runner.completed();
    });
  });
});
