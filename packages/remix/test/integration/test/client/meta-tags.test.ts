import { test, expect } from '@playwright/test';

test('should inject `sentry-trace` and `baggage` meta tags inside the root page.', async ({ page }) => {
  await page.goto('/');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');

  expect(sentryTraceContent).toEqual(expect.any(String));

  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  expect(sentryBaggageContent).toEqual(expect.any(String));
});

test('should inject `sentry-trace` and `baggage` meta tags inside a parameterized route.', async ({ page }) => {
  await page.goto('/loader-json-response/0');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');

  expect(sentryTraceContent).toEqual(expect.any(String));

  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  expect(sentryBaggageContent).toEqual(expect.any(String));
});
