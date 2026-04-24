import { createTestServer } from '@sentry-internal/test-utils';
import { expect, test } from 'vitest';
import { createRunner } from '../../../../utils/runner';

test('infers sentry.op, name, and source for streamed outgoing fetch spans', async () => {
  expect.assertions(4);

  const [SERVER_URL, closeTestServer] = await createTestServer()
    .get('/api/v0', () => {
      expect(true).toBe(true);
    })
    .start();

  await createRunner(__dirname, 'scenario.ts')
    .withEnv({ SERVER_URL })
    .expect({
      span: container => {
        const httpClientSpan = container.items.find(
          item =>
            item.attributes?.['sentry.op']?.type === 'string' && item.attributes['sentry.op'].value === 'http.client',
        );

        expect(httpClientSpan).toBeDefined();
        expect(httpClientSpan?.name).toMatch(/^GET /);
        expect(httpClientSpan?.attributes?.['sentry.source']).toEqual({ type: 'string', value: 'url' });
      },
    })
    .start()
    .completed();
  closeTestServer();
});
