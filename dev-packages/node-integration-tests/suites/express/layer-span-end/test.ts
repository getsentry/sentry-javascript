import { EventEmitter } from 'node:events';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

const MIDDLEWARE_COUNT = 12;

describe('express layer span end', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('ends each middleware span when it calls `next`, before the route handler runs', async () => {
      const runner = createRunner()
        .unordered()
        .expect({
          span: container => {
            const middlewareSpans = container.items.filter(
              item => item.attributes['express.type']?.value === 'middleware',
            );
            const handlerSpan = container.items.find(
              item => item.attributes['express.type']?.value === 'request_handler',
            );

            // Express 4 also runs its built-in `query` and `expressInit` middleware.
            expect(middlewareSpans.filter(span => span.name === 'syncMiddleware')).toHaveLength(MIDDLEWARE_COUNT);
            expect(handlerSpan).toBeDefined();

            for (const middlewareSpan of middlewareSpans) {
              expect(middlewareSpan.end_timestamp).toBeLessThanOrEqual(handlerSpan!.start_timestamp);
            }
          },
        })
        .start();

      runner.makeRequest('get', '/test/express');
      await runner.completed();
    });

    test('does not accumulate a response `finish` listener per layer', async () => {
      const runner = createRunner().start();

      const response = await runner.makeRequest<{ finishListeners: number }>('get', '/test/express');

      expect(response?.finishListeners).toBeLessThan(EventEmitter.defaultMaxListeners);
    });
  });
});
