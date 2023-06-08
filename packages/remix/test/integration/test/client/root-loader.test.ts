import { test, expect, Page } from '@playwright/test';

async function getRouteData(page: Page): Promise<any> {
  return page.evaluate('window.__remixContext.routeData').catch(err => {
    console.warn(err);

    return {};
  });
}

async function extractTraceAndBaggageFromMeta(
  page: Page,
): Promise<{ sentryTrace?: string | null; sentryBaggage?: string | null }> {
  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');

  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  return { sentryTrace: sentryTraceContent, sentryBaggage: sentryBaggageContent };
}

test('should inject `sentry-trace` and `baggage` into root loader returning an empty object.', async ({ page }) => {
  await page.goto('/?type=empty');

  const { sentryTrace, sentryBaggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toEqual(expect.any(String));
  expect(sentryBaggage).toEqual(expect.any(String));

  const rootData = (await getRouteData(page))['root'];

  expect(rootData).toMatchObject({
    sentryTrace,
    sentryBaggage,
  });
});

test('should inject `sentry-trace` and `baggage` into root loader returning a plain object.', async ({ page }) => {
  await page.goto('/?type=plain');

  const { sentryTrace, sentryBaggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toEqual(expect.any(String));
  expect(sentryBaggage).toEqual(expect.any(String));

  const rootData = (await getRouteData(page))['root'];

  expect(rootData).toMatchObject({
    data_one: [],
    data_two: 'a string',
    sentryTrace: sentryTrace,
    sentryBaggage: sentryBaggage,
  });
});

test('should inject `sentry-trace` and `baggage` into root loader returning a `JSON response`.', async ({ page }) => {
  await page.goto('/?type=json');

  const { sentryTrace, sentryBaggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toEqual(expect.any(String));
  expect(sentryBaggage).toEqual(expect.any(String));

  const rootData = (await getRouteData(page))['root'];

  expect(rootData).toMatchObject({
    data_one: [],
    data_two: 'a string',
    sentryTrace: sentryTrace,
    sentryBaggage: sentryBaggage,
  });
});

test('should inject `sentry-trace` and `baggage` into root loader returning a deferred response', async ({ page }) => {
  await page.goto('/?type=defer');

  const { sentryTrace, sentryBaggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toEqual(expect.any(String));
  expect(sentryBaggage).toEqual(expect.any(String));

  const rootData = (await getRouteData(page))['root'];

  expect(rootData).toMatchObject({
    sentryTrace: sentryTrace,
    sentryBaggage: sentryBaggage,
  });
});

test('should inject `sentry-trace` and `baggage` into root loader returning `null`.', async ({ page }) => {
  await page.goto('/?type=null');

  const { sentryTrace, sentryBaggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toEqual(expect.any(String));
  expect(sentryBaggage).toEqual(expect.any(String));

  const rootData = (await getRouteData(page))['root'];

  expect(rootData).toMatchObject({
    sentryTrace: sentryTrace,
    sentryBaggage: sentryBaggage,
  });
});

test('should inject `sentry-trace` and `baggage` into root loader returning `undefined`.', async ({ page }) => {
  await page.goto('/?type=undefined');

  const { sentryTrace, sentryBaggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toEqual(expect.any(String));
  expect(sentryBaggage).toEqual(expect.any(String));

  const rootData = (await getRouteData(page))['root'];

  expect(rootData).toMatchObject({
    sentryTrace: sentryTrace,
    sentryBaggage: sentryBaggage,
  });
});

test('should inject `sentry-trace` and `baggage` into root loader throwing a redirection to a plain object.', async ({
  page,
}) => {
  await page.goto('/?type=throwRedirect');

  const { sentryTrace, sentryBaggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toEqual(expect.any(String));
  expect(sentryBaggage).toEqual(expect.any(String));

  const rootData = (await getRouteData(page))['root'];

  expect(rootData).toMatchObject({
    sentryTrace: sentryTrace,
    sentryBaggage: sentryBaggage,
  });
});

test('should inject `sentry-trace` and `baggage` into root loader returning a redirection to a plain object', async ({
  page,
}) => {
  await page.goto('/?type=returnRedirect');

  const { sentryTrace, sentryBaggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toEqual(expect.any(String));
  expect(sentryBaggage).toEqual(expect.any(String));

  const rootData = (await getRouteData(page))['root'];

  expect(rootData).toMatchObject({
    sentryTrace: sentryTrace,
    sentryBaggage: sentryBaggage,
  });
});
