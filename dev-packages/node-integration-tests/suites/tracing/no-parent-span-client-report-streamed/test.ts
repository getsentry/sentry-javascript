import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('no_parent_span with streaming enabled', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('sends http.client span without a local parent when span streaming is enabled', async () => {
      const runner = createRunner()
        .expect({
          span: span => {
            const httpClientSpan = span.items.find(item =>
              item.attributes?.['sentry.op']
                ? item.attributes['sentry.op'].type === 'string' && item.attributes['sentry.op'].value === 'http.client'
                : false,
            );

            expect(httpClientSpan).toBeDefined();
            expect(httpClientSpan?.name).toMatch(/^GET /);
          },
        })
        .start();

      await runner.completed();
    });
  });
});
