import { type Page, expect, test } from '@playwright/test';

async function extractTraceAndBaggageFromMeta(
  page: Page,
): Promise<{ sentryTrace?: string | null; sentryBaggage?: string | null }> {
  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');

  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  return { sentryTrace: sentryTraceContent, sentryBaggage: sentryBaggageContent };
}

test('should inject `sentry-trace` and `baggage` meta tags with empty loader', async ({ page }) => {
  await page.goto('/?type=empty');
  const { sentryTrace, sentryBaggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toMatch(/.+/);
  expect(sentryBaggage).toMatch(/.+/);
});

test('should inject `sentry-trace` and `baggage` meta tags with plain object loader', async ({ page }) => {
  await page.goto('/?type=plain');
  const { sentryTrace, sentryBaggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toMatch(/.+/);
  expect(sentryBaggage).toMatch(/.+/);
});

test('should inject `sentry-trace` and `baggage` meta tags with JSON response loader', async ({ page }) => {
  await page.goto('/?type=json');
  const { sentryTrace, sentryBaggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toMatch(/.+/);
  expect(sentryBaggage).toMatch(/.+/);
});

test('should inject `sentry-trace` and `baggage` meta tags with deferred response loader', async ({ page }) => {
  await page.goto('/?type=defer');
  const { sentryTrace, sentryBaggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toMatch(/.+/);
  expect(sentryBaggage).toMatch(/.+/);
});

test('should inject `sentry-trace` and `baggage` meta tags with null loader', async ({ page }) => {
  await page.goto('/?type=null');
  const { sentryTrace, sentryBaggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toMatch(/.+/);
  expect(sentryBaggage).toMatch(/.+/);
});

test('should inject `sentry-trace` and `baggage` meta tags with undefined loader', async ({ page }) => {
  await page.goto('/?type=undefined');
  const { sentryTrace, sentryBaggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toMatch(/.+/);
  expect(sentryBaggage).toMatch(/.+/);
});

test('should inject `sentry-trace` and `baggage` meta tags with throw redirect loader', async ({ page }) => {
  await page.goto('/?type=throwRedirect');
  const { sentryTrace, sentryBaggage } = await extractTraceAndBaggageFromMeta(page);

  // We should be successfully redirected to the path.
  expect(page.url()).toEqual(expect.stringContaining('/?type=plain'));

  expect(sentryTrace).toMatch(/.+/);
  expect(sentryBaggage).toMatch(/.+/);
});

test('should inject `sentry-trace` and `baggage` meta tags with return redirect loader', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/?type=returnRedirect`);
  const { sentryTrace, sentryBaggage } = await extractTraceAndBaggageFromMeta(page);

  // We should be successfully redirected to the path.
  expect(page.url()).toEqual(expect.stringContaining('/?type=plain'));

  expect(sentryTrace).toMatch(/.+/);
  expect(sentryBaggage).toMatch(/.+/);
});

test('should return redirect to an external path with no baggage and trace injected.', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/?type=returnRedirectToExternal`);

  expect(page.url()).toEqual(expect.stringContaining('docs.sentry.io'));

  const { sentryTrace, sentryBaggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toBeUndefined();
  expect(sentryBaggage).toBeUndefined();
});

test('should throw redirect to an external path with no baggage and trace injected.', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/?type=throwRedirectToExternal`);

  // We should be successfully redirected to the external path.
  expect(page.url()).toEqual(expect.stringContaining('docs.sentry.io'));

  const { sentryTrace, sentryBaggage } = await extractTraceAndBaggageFromMeta(page);

  expect(sentryTrace).toBeUndefined();
  expect(sentryBaggage).toBeUndefined();
});
