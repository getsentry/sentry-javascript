import { test, expect, Page } from '@playwright/test';

export function getRouteData(page: Page): Promise<any> {
  return page.evaluate('window.__remixContext.routeData').catch(err => {
    return {};
  });
}

test('should inject `sentry-trace` and `baggage` into root loader returning `{}`.', async ({ page }) => {
  await page.goto('/?type=empty');
  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');

  expect(sentryTraceContent).toEqual(expect.any(String));

  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  expect(sentryBaggageContent).toEqual(expect.any(String));

  const rootData = (await getRouteData(page))['root'];

  expect(rootData).toMatchObject({
    sentryTrace: sentryTraceContent,
    sentryBaggage: sentryBaggageContent,
  });
});

test('should inject `sentry-trace` and `baggage` into root loader returning a plain object.', async ({ page }) => {
  await page.goto('/?type=plain');
  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');

  expect(sentryTraceContent).toEqual(expect.any(String));

  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  expect(sentryBaggageContent).toEqual(expect.any(String));

  const rootData = (await getRouteData(page))['root'];

  expect(rootData).toMatchObject({
    data_one: [],
    data_two: 'a string',
    sentryTrace: sentryTraceContent,
    sentryBaggage: sentryBaggageContent,
  });
});

test('should inject `sentry-trace` and `baggage` into root loader returning a `JSON response`.', async ({ page }) => {
  await page.goto('/?type=json');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');

  expect(sentryTraceContent).toEqual(expect.any(String));

  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  expect(sentryBaggageContent).toEqual(expect.any(String));

  const rootData = (await getRouteData(page))['root'];

  expect(rootData).toMatchObject({
    data_one: [],
    data_two: 'a string',
    sentryTrace: sentryTraceContent,
    sentryBaggage: sentryBaggageContent,
  });
});

test('should inject `sentry-trace` and `baggage` into root loader returning `null`.', async ({ page }) => {
  await page.goto('/?type=null');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');

  expect(sentryTraceContent).toEqual(expect.any(String));

  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  expect(sentryBaggageContent).toEqual(expect.any(String));

  const rootData = (await getRouteData(page))['root'];

  expect(rootData).toMatchObject({
    sentryTrace: sentryTraceContent,
    sentryBaggage: sentryBaggageContent,
  });
});

test('should inject `sentry-trace` and `baggage` into root loader returning `undefined`.', async ({ page }) => {
  await page.goto('/?type=undefined');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');

  expect(sentryTraceContent).toEqual(expect.any(String));

  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  expect(sentryBaggageContent).toEqual(expect.any(String));

  const rootData = (await getRouteData(page))['root'];

  expect(rootData).toMatchObject({
    sentryTrace: sentryTraceContent,
    sentryBaggage: sentryBaggageContent,
  });
});

test('should inject `sentry-trace` and `baggage` into root loader throwing a redirection to a plain object.', async ({
  page,
}) => {
  await page.goto('/?type="throw-redirect"');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');

  expect(sentryTraceContent).toEqual(expect.any(String));

  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  expect(sentryBaggageContent).toEqual(expect.any(String));

  const rootData = (await getRouteData(page))['root'];

  expect(rootData).toMatchObject({
    sentryTrace: sentryTraceContent,
    sentryBaggage: sentryBaggageContent,
  });
});

test('should inject `sentry-trace` and `baggage` into root loader returning a redirection to a plain object', async ({
  page,
}) => {
  await page.goto('/?type="return-redirect"');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');

  expect(sentryTraceContent).toEqual(expect.any(String));

  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  expect(sentryBaggageContent).toEqual(expect.any(String));

  const rootData = (await getRouteData(page))['root'];

  expect(rootData).toMatchObject({
    sentryTrace: sentryTraceContent,
    sentryBaggage: sentryBaggageContent,
  });
});

test('should inject `sentry-trace` and `baggage` into root loader returning a redirection to a `JSON response`', async ({
  page,
}) => {
  await page.goto('/?type="return-redirect"');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');

  expect(sentryTraceContent).toEqual(expect.any(String));

  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  expect(sentryBaggageContent).toEqual(expect.any(String));

  const rootData = (await getRouteData(page))['root'];

  expect(rootData).toMatchObject({
    sentryTrace: sentryTraceContent,
    sentryBaggage: sentryBaggageContent,
  });
});
