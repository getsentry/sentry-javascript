import { expect, test } from '@playwright/test';

// With Server-Timing headers as the primary trace propagation method,
// meta tags are no longer injected in Node.js/Cloudflare environments.
// These tests verify that meta tags are NOT present for various loader types.

test('should NOT inject meta tags with empty loader (Server-Timing is used instead)', async ({ page }) => {
  await page.goto('/?type=empty');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryBaggageTag = await page.$('meta[name="baggage"]');

  // Meta tags should not be present - Server-Timing headers are used instead
  expect(sentryTraceTag).toBeNull();
  expect(sentryBaggageTag).toBeNull();
});

test('should NOT inject meta tags with plain object loader (Server-Timing is used instead)', async ({ page }) => {
  await page.goto('/?type=plain');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryBaggageTag = await page.$('meta[name="baggage"]');

  expect(sentryTraceTag).toBeNull();
  expect(sentryBaggageTag).toBeNull();
});

test('should NOT inject meta tags with JSON response loader (Server-Timing is used instead)', async ({ page }) => {
  await page.goto('/?type=json');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryBaggageTag = await page.$('meta[name="baggage"]');

  expect(sentryTraceTag).toBeNull();
  expect(sentryBaggageTag).toBeNull();
});

test('should NOT inject meta tags with deferred response loader (Server-Timing is used instead)', async ({ page }) => {
  await page.goto('/?type=defer');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryBaggageTag = await page.$('meta[name="baggage"]');

  expect(sentryTraceTag).toBeNull();
  expect(sentryBaggageTag).toBeNull();
});

test('should NOT inject meta tags with null loader (Server-Timing is used instead)', async ({ page }) => {
  await page.goto('/?type=null');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryBaggageTag = await page.$('meta[name="baggage"]');

  expect(sentryTraceTag).toBeNull();
  expect(sentryBaggageTag).toBeNull();
});

test('should NOT inject meta tags with undefined loader (Server-Timing is used instead)', async ({ page }) => {
  await page.goto('/?type=undefined');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryBaggageTag = await page.$('meta[name="baggage"]');

  expect(sentryTraceTag).toBeNull();
  expect(sentryBaggageTag).toBeNull();
});

test('should NOT inject meta tags with throw redirect loader (Server-Timing is used instead)', async ({ page }) => {
  await page.goto('/?type=throwRedirect');

  // We should be successfully redirected to the path.
  expect(page.url()).toEqual(expect.stringContaining('/?type=plain'));

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryBaggageTag = await page.$('meta[name="baggage"]');

  // Meta tags should not be present after redirect either
  expect(sentryTraceTag).toBeNull();
  expect(sentryBaggageTag).toBeNull();
});

test('should NOT inject meta tags with return redirect loader (Server-Timing is used instead)', async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/?type=returnRedirect`);

  // We should be successfully redirected to the path.
  expect(page.url()).toEqual(expect.stringContaining('/?type=plain'));

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryBaggageTag = await page.$('meta[name="baggage"]');

  // Meta tags should not be present after redirect either
  expect(sentryTraceTag).toBeNull();
  expect(sentryBaggageTag).toBeNull();
});

test('should return redirect to an external path with no baggage and trace meta tags.', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/?type=returnRedirectToExternal`);

  expect(page.url()).toEqual(expect.stringContaining('docs.sentry.io'));

  // External page won't have our meta tags
  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryBaggageTag = await page.$('meta[name="baggage"]');

  expect(sentryTraceTag).toBeNull();
  expect(sentryBaggageTag).toBeNull();
});

test('should throw redirect to an external path with no baggage and trace meta tags.', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/?type=throwRedirectToExternal`);

  // We should be successfully redirected to the external path.
  expect(page.url()).toEqual(expect.stringContaining('docs.sentry.io'));

  // External page won't have our meta tags
  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryBaggageTag = await page.$('meta[name="baggage"]');

  expect(sentryTraceTag).toBeNull();
  expect(sentryBaggageTag).toBeNull();
});
