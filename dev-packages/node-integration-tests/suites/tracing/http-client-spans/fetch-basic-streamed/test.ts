import { createTestServer } from '@sentry-internal/test-utils';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createCjsTests } from '../../../../utils/runner';

describe('streamed outgoing fetch spans', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('infers sentry.op for streamed outgoing fetch spans', async () => {
      expect.assertions(4);

      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/api/v0', () => {
          expect(true).toBe(true);
        })
        .start();

      await createRunner()
        .withEnv({ SERVER_URL })
        .expect({
          span: container => {
            const httpClientSpan = container.items.find(
              item =>
                item.attributes['sentry.op']?.type === 'string' && item.attributes['sentry.op'].value === 'http.client',
            );

            expect(httpClientSpan).toBeDefined();
            // The URL path is high cardinality, so a streamed name keeps only the domain.
            expect(httpClientSpan?.name).toBe('GET localhost');
            expect(httpClientSpan?.attributes['url.domain']?.value).toBe('localhost');
          },
        })
        .start()
        .completed();
      closeTestServer();
    });
  });
});
