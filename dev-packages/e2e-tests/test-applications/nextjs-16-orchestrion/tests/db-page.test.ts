import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Instruments DB calls made during server-side rendering of a page', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('nextjs-16-orchestrion', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /db-page';
  });

  await page.goto('/db-page');
  await expect(page.locator('#answer')).toHaveText('answer: 42');
  await expect(page.locator('#cached')).toHaveText('cached: 42');

  const transactionEvent = await transactionEventPromise;

  const spans = transactionEvent.spans || [];

  // One page render produces spans from both injection paths: pg (externalized → runtime module
  // hook) and ioredis (bundle-safe allowlisted → build-time loader).
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.postgres',
      description: 'SELECT 40 + 2 AS answer',
      status: 'ok',
      data: expect.objectContaining({
        'db.system': 'postgresql',
        'db.statement': 'SELECT 40 + 2 AS answer',
      }),
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.redis',
      description: 'set page-key [1 other arguments]',
      status: 'ok',
      data: expect.objectContaining({
        'db.system': 'redis',
        'db.statement': 'set page-key [1 other arguments]',
      }),
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'db',
      origin: 'auto.db.redis',
      description: 'get page-key',
      status: 'ok',
    }),
  );
});
