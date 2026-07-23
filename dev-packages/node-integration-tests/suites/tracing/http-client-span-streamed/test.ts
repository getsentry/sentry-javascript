import { SENTRY_OP } from '@sentry/conventions/attributes';
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
              item.attributes[SENTRY_OP]
                ? item.attributes[SENTRY_OP].type === 'string' && item.attributes[SENTRY_OP].value === 'http.client'
                : false,
            );

            expect(httpClientSpan).toBeDefined();
            expect(httpClientSpan?.name).toMatch(/^GET .*\/external$/);
          },
        })
        .start();

      await runner.completed();
    });
  });
});
