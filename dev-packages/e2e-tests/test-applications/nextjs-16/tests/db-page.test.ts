import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getRuntime } from '@sentry-internal/test-utils';

// pg is externalized, so the runtime module hook instruments it.
test('Instruments pg calls made during server-side rendering of a page', async ({ page }) => {
  test.skip(getRuntime() === 'bun' || getRuntime() === 'cloudflare', 'Bun and Workers have no runtime module hook');

  // The db spans are children of the segment span, which ends last.
  const spansPromise = collectStreamedSpansUntilSegment('nextjs-16', 'GET /db-page');

  await page.goto('/db-page');
  await expect(page.locator('#answer')).toHaveText('answer: 42');

  const spans = await spansPromise;

  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'SELECT',
      status: 'ok',
      attributes: expect.objectContaining({
        'sentry.op': { value: 'db', type: 'string' },
        'sentry.origin': { value: 'auto.db.postgres', type: 'string' },
        'db.system.name': { value: 'postgresql', type: 'string' },
        'db.query.text': { value: 'SELECT ? + ? AS answer', type: 'string' },
      }),
    }),
  );
});

// ioredis is bundle-safe and allowlisted, so the build-time loader instruments it.
test('Instruments ioredis calls made during server-side rendering of a page', async ({ page }) => {
  // The db spans are children of the segment span, which ends last.
  const spansPromise = collectStreamedSpansUntilSegment('nextjs-16', 'GET /db-page');

  await page.goto('/db-page');
  await expect(page.locator('#cached')).toHaveText('cached: 42');

  const spans = await spansPromise;

  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'set localhost:6379',
      status: 'ok',
      attributes: expect.objectContaining({
        'sentry.op': { value: 'db.query', type: 'string' },
        'sentry.origin': { value: 'auto.db.redis', type: 'string' },
        'db.system.name': { value: 'redis', type: 'string' },
        'db.operation.name': { value: 'set', type: 'string' },
        'db.query.text': { value: 'set page-key [1 other arguments]', type: 'string' },
      }),
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'get localhost:6379',
      status: 'ok',
      attributes: expect.objectContaining({
        'sentry.op': { value: 'db.query', type: 'string' },
        'sentry.origin': { value: 'auto.db.redis', type: 'string' },
        'db.system.name': { value: 'redis', type: 'string' },
        'db.operation.name': { value: 'get', type: 'string' },
        'db.query.text': { value: 'get page-key', type: 'string' },
      }),
    }),
  );
});
