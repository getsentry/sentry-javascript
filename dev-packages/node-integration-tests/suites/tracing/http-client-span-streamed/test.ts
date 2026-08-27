import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('http.client span with streaming enabled', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario-fetch.mjs', 'instrument.mjs', (createRunner, test) => {
    test('sends http.client span without a local parent when span streaming is enabled', async () => {
      const runner = createRunner()
        .expect({
          span: span => {
            const httpClientSpan = span.items.find(item =>
              item.attributes['sentry.op']
                ? item.attributes['sentry.op'].type === 'string' && item.attributes['sentry.op'].value === 'http.client'
                : false,
            );

            expect(httpClientSpan).toBeDefined();
            // The URL path is high cardinality, so a streamed span name keeps only the domain.
            expect(httpClientSpan?.name).toBe('GET localhost');
          },
        })
        .start();

      await runner.completed();
    });
  });
});
