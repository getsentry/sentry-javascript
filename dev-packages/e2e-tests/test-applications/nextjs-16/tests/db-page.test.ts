import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getRuntime } from '@sentry-internal/test-utils';
import { isVinext } from './isVinext';

test('Instruments DB calls made during server-side rendering of a page', async ({ page }) => {
  test.skip(isVinext && getRuntime() === 'bun', 'Bun has no runtime module hook and vinext no build-time loader');

  // The db spans are children of the segment span, which ends last.
  const spansPromise = collectStreamedSpansUntilSegment('nextjs-16', 'GET /db-page');

  await page.goto('/db-page');
  await expect(page.locator('#answer')).toHaveText('answer: 42');
  await expect(page.locator('#cached')).toHaveText('cached: 42');

  const spans = await spansPromise;

  // One page render produces spans from both injection paths: pg (externalized → runtime module
  // hook) and ioredis (bundle-safe allowlisted → build-time loader). Bun and Workers have no runtime module
  // hook, so pg creates no spans there. vinext does not run the build-time loader of webpack or Turbopack, so ioredis
  // creates no spans there.
  if (getRuntime() !== 'bun' && getRuntime() !== 'cloudflare') {
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
  }
  if (!isVinext) {
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
  }
});
