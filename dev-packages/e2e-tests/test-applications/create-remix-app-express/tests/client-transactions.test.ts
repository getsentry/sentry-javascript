import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Sends a pageload span to Sentry', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('create-remix-app-express', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/';
  });

  await page.goto('/');

  const span = await spanPromise;

  expect(span.attributes).toMatchObject({
    'sentry.origin': { value: 'auto.pageload.remix', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/$/), type: 'string' },
    'url.path': { value: '/', type: 'string' },
    'url.template': { value: '/', type: 'string' },
  });
});

test('Sends a navigation span to Sentry', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('create-remix-app-express', span => {
    return getSpanOp(span) === 'navigation' && span.is_segment && span.name === '/user/:id';
  });

  await page.goto('/');

  const linkElement = page.locator('id=navigation');
  await linkElement.click();

  const span = await spanPromise;

  expect(span.attributes).toMatchObject({
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/user\/5$/), type: 'string' },
    'url.path': { value: '/user/5', type: 'string' },
    'url.template': { value: '/user/:id', type: 'string' },
  });
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

test('Pageload span is parameterized for a dynamic route', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('create-remix-app-express', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/error-boundary-capture/:id';
  });

  await page.goto('/error-boundary-capture/123');

  const span = await spanPromise;

  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('Pageload span is parameterized for a 2-level nested route', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('create-remix-app-express', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/users/:userId/posts/:postId';
  });

  await page.goto('/users/user123/posts/post456');

  const span = await spanPromise;

  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('Pageload span is parameterized for a deeply nested route', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('create-remix-app-express', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/deeply/:nested/:structure/:id';
  });

  await page.goto('/deeply/level1/level2/level3');

  const span = await spanPromise;

  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('Pageload span is parameterized for a flat dot-notation route', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('create-remix-app-express', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/products/:productId/reviews/:reviewId';
  });

  await page.goto('/products/prod789/reviews/rev101');

  const span = await spanPromise;

  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('Reports a manually created span', async ({ page }) => {
  const spanPromise = waitForStreamedSpan('create-remix-app-express', span => {
    return span.name === 'test_transaction_1';
  });

  await page.goto('/manual-tracing/0');

  const span = await spanPromise;

  expect(span.attributes['sentry.sdk.name']?.value).toBe('sentry.javascript.remix');
  expect(span.start_timestamp).toBeDefined();
  expect(span.end_timestamp).toBeDefined();
});

test('Renders data from a deferred loader response', async ({ page }) => {
  await page.goto('/loader-defer-response/98765');

  const renderedId = await page.waitForSelector('#data-render');
  expect(await renderedId.textContent()).toBe('98765');
});
