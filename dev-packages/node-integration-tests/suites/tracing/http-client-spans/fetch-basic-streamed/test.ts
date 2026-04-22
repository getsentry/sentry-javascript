import { createTestServer } from '@sentry-internal/test-utils';
import { expect, test } from 'vitest';
import { createRunner } from '../../../../utils/runner';

test('captures streamed spans with sentry.op for outgoing fetch requests', async () => {
  expect.assertions(2);

  const [SERVER_URL, closeTestServer] = await createTestServer()
    .get('/api/v0', () => {
      // Just ensure we're called
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
      },
    })
    .start()
    .completed();
  closeTestServer();
});
