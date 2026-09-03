import { expect, test } from '@playwright/test';
import { collectStreamedSpans } from '@sentry-internal/test-utils';

test('Instruments DB calls made during server-side rendering of a page', async ({ page }) => {
  // The db spans are children of the segment span, which ends last.
  const spansPromise = collectStreamedSpans('nextjs-16', spans =>
    spans.some(span => span.name === 'GET /db-page' && span.is_segment),
  );

  await page.goto('/db-page');
  await expect(page.locator('#answer')).toHaveText('answer: 42');
  await expect(page.locator('#cached')).toHaveText('cached: 42');

  const spans = await spansPromise;

  // One page render produces spans from both injection paths: pg (externalized → runtime module
  // hook) and ioredis (bundle-safe allowlisted → build-time loader).
  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'SELECT',
      status: 'ok',
      attributes: expect.objectContaining({
        'sentry.op': { value: 'db', type: 'string' },
        'sentry.origin': { value: 'auto.db.postgres', type: 'string' },
        'db.system.name': { value: 'postgresql', type: 'string' },
        'db.query.text': { value: 'SELECT 40 + 2 AS answer', type: 'string' },
      }),
    }),
  );
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
