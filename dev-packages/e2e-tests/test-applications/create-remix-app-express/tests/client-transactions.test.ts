import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a pageload transaction to Sentry', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/';
  });

  await page.goto('/');

  const transactionEvent = await transactionPromise;

  expect(transactionEvent).toBeDefined();
});

test('Sends a navigation transaction to Sentry', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'navigation' && transactionEvent.transaction === '/user/:id';
  });

  await page.goto('/');

  const linkElement = page.locator('id=navigation');
  await linkElement.click();

  const transactionEvent = await transactionPromise;

  expect(transactionEvent).toBeDefined();
});

test('Renders `sentry-trace` and `baggage` meta tags for the root route', async ({ page }) => {
  await page.goto('/');

  const sentryTraceMetaTag = await page.waitForSelector('meta[name="sentry-trace"]', {
    state: 'attached',
  });
  const baggageMetaTag = await page.waitForSelector('meta[name="baggage"]', {
    state: 'attached',
  });

  expect(sentryTraceMetaTag).toBeTruthy();
  expect(baggageMetaTag).toBeTruthy();
});

test('Renders `sentry-trace` and `baggage` meta tags for a sub-route', async ({ page }) => {
  await page.goto('/user/123');

  const sentryTraceMetaTag = await page.waitForSelector('meta[name="sentry-trace"]', {
    state: 'attached',
  });
  const baggageMetaTag = await page.waitForSelector('meta[name="baggage"]', {
    state: 'attached',
  });

  expect(sentryTraceMetaTag).toBeTruthy();
  expect(baggageMetaTag).toBeTruthy();
});

async function extractTraceAndBaggageFromMeta(page: import('@playwright/test').Page) {
  const sentryTrace = await page.$('meta[name="sentry-trace"]').then(t => t?.getAttribute('content'));
  const baggage = await page.$('meta[name="baggage"]').then(t => t?.getAttribute('content'));
  return { sentryTrace, baggage };
}

for (const type of ['empty', 'plain', 'json', 'defer', 'null', 'undefined'] as const) {
  test(`Injects sentry-trace and baggage meta tags with ${type} root loader`, async ({ page }) => {
    await page.goto(`/?type=${type}`);
    const { sentryTrace, baggage } = await extractTraceAndBaggageFromMeta(page);

    expect(sentryTrace).toMatch(/.+/);
    expect(baggage).toMatch(/.+/);
  });
}

test('Injects sentry-trace and baggage meta tags after a thrown internal redirect', async ({ page }) => {
  await page.goto('/?type=throwRedirect');

  expect(page.url()).toEqual(expect.stringContaining('/?type=plain'));

  const { sentryTrace, baggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toMatch(/.+/);
  expect(baggage).toMatch(/.+/);
});

test('Injects sentry-trace and baggage meta tags after a returned internal redirect', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/?type=returnRedirect`);

  expect(page.url()).toEqual(expect.stringContaining('/?type=plain'));

  const { sentryTrace, baggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toMatch(/.+/);
  expect(baggage).toMatch(/.+/);
});

test('Does not inject sentry-trace and baggage when returning an external redirect', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/?type=returnRedirectToExternal`);

  expect(page.url()).toEqual(expect.stringContaining('docs.sentry.io'));

  const { sentryTrace, baggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toBeFalsy();
  expect(baggage).toBeFalsy();
});

test('Does not inject sentry-trace and baggage when throwing an external redirect', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/?type=throwRedirectToExternal`);

  expect(page.url()).toEqual(expect.stringContaining('docs.sentry.io'));

  const { sentryTrace, baggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toBeFalsy();
  expect(baggage).toBeFalsy();
});

test('Pageload transaction is parameterized for a dynamic route', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.transaction === '/error-boundary-capture/:id'
    );
  });

  await page.goto('/error-boundary-capture/123');

  const transactionEvent = await transactionPromise;

  expect(transactionEvent.contexts?.trace?.data?.['sentry.source']).toBe('route');
});

test('Pageload transaction is parameterized for a 2-level nested route', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.transaction === '/users/:userId/posts/:postId'
    );
  });

  await page.goto('/users/user123/posts/post456');

  const transactionEvent = await transactionPromise;

  expect(transactionEvent.contexts?.trace?.data?.['sentry.source']).toBe('route');
});

test('Pageload transaction is parameterized for a deeply nested route', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.transaction === '/deeply/:nested/:structure/:id'
    );
  });

  await page.goto('/deeply/level1/level2/level3');

  const transactionEvent = await transactionPromise;

  expect(transactionEvent.contexts?.trace?.data?.['sentry.source']).toBe('route');
});

test('Pageload transaction is parameterized for a flat dot-notation route', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.transaction === '/products/:productId/reviews/:reviewId'
    );
  });

  await page.goto('/products/prod789/reviews/rev101');

  const transactionEvent = await transactionPromise;

  expect(transactionEvent.contexts?.trace?.data?.['sentry.source']).toBe('route');
});

test('Reports a manually created transaction', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent.transaction === 'test_transaction_1';
  });

  await page.goto('/manual-tracing/0');

  const transactionEvent = await transactionPromise;

  expect(transactionEvent.sdk?.name).toBe('sentry.javascript.remix');
  expect(transactionEvent.start_timestamp).toBeDefined();
  expect(transactionEvent.timestamp).toBeDefined();
});

test('Renders data from a deferred loader response', async ({ page }) => {
  await page.goto('/loader-defer-response/98765');

  const renderedId = await page.waitForSelector('#data-render');
  expect(await renderedId.textContent()).toBe('98765');
});
