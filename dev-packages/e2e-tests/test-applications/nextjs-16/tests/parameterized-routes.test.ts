import { expect, test } from '@playwright/test';
import { waitForRootSpan } from '@sentry-internal/test-utils';

test('should create a parameterized transaction when the `app` directory is used', async ({ page }) => {
  const rootSpanPromise = waitForRootSpan('nextjs-16', async rootSpan => {
    return rootSpan.name === '/parameterized/:one' && rootSpan.op === 'pageload';
  });

  await page.goto(`/parameterized/cappuccino`);

  const rootSpan = await rootSpanPromise;

  expect(rootSpan.name).toBe('/parameterized/:one');
  expect(rootSpan.op).toBe('pageload');
  expect(rootSpan.traceId).toMatch(/[a-f0-9]{32}/);
  expect(rootSpan.attributes).toEqual(
    expect.objectContaining({
      'sentry.op': 'pageload',
      'sentry.origin': 'auto.pageload.nextjs.app_router_instrumentation',
      'sentry.source': 'route',
    }),
  );
});

test('should create a static transaction when the `app` directory is used and the route is not parameterized', async ({
  page,
}) => {
  const rootSpanPromise = waitForRootSpan('nextjs-16', async rootSpan => {
    return rootSpan.name === '/parameterized/static' && rootSpan.op === 'pageload';
  });

  await page.goto(`/parameterized/static`);

  const rootSpan = await rootSpanPromise;

  expect(rootSpan.name).toBe('/parameterized/static');
  expect(rootSpan.op).toBe('pageload');
  expect(rootSpan.traceId).toMatch(/[a-f0-9]{32}/);
  expect(rootSpan.attributes).toEqual(
    expect.objectContaining({
      'sentry.op': 'pageload',
      'sentry.origin': 'auto.pageload.nextjs.app_router_instrumentation',
      'sentry.source': 'url',
    }),
  );
});

test('should create a partially parameterized transaction when the `app` directory is used', async ({ page }) => {
  const rootSpanPromise = waitForRootSpan('nextjs-16', async rootSpan => {
    return rootSpan.name === '/parameterized/:one/beep' && rootSpan.op === 'pageload';
  });

  await page.goto(`/parameterized/cappuccino/beep`);

  const rootSpan = await rootSpanPromise;

  expect(rootSpan.name).toBe('/parameterized/:one/beep');
  expect(rootSpan.op).toBe('pageload');
  expect(rootSpan.traceId).toMatch(/[a-f0-9]{32}/);
  expect(rootSpan.attributes).toEqual(
    expect.objectContaining({
      'sentry.op': 'pageload',
      'sentry.origin': 'auto.pageload.nextjs.app_router_instrumentation',
      'sentry.source': 'route',
    }),
  );
});

test('should create a nested parameterized transaction when the `app` directory is used.', async ({ page }) => {
  const rootSpanPromise = waitForRootSpan('nextjs-16', async rootSpan => {
    return rootSpan.name === '/parameterized/:one/beep/:two' && rootSpan.op === 'pageload';
  });

  await page.goto(`/parameterized/cappuccino/beep/espresso`);

  const rootSpan = await rootSpanPromise;

  expect(rootSpan.name).toBe('/parameterized/:one/beep/:two');
  expect(rootSpan.op).toBe('pageload');
  expect(rootSpan.traceId).toMatch(/[a-f0-9]{32}/);
  expect(rootSpan.attributes).toEqual(
    expect.objectContaining({
      'sentry.op': 'pageload',
      'sentry.origin': 'auto.pageload.nextjs.app_router_instrumentation',
      'sentry.source': 'route',
    }),
  );
});
