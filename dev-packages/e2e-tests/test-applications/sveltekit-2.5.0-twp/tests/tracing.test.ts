import { expect, test } from '@playwright/test';

test('Initially loaded page contains trace meta tags from backend trace', async ({ page }) => {
  await page.goto('/');

  const sentryTraceMetaTag = page.locator('meta[name="sentry-trace"]').first();
  const sentryTraceContent = await sentryTraceMetaTag.getAttribute('content');

  const baggageMetaTag = page.locator('meta[name="baggage"]').first();
  const baggageContent = await baggageMetaTag.getAttribute('content');

  // ensure that we do not pass a sampled -1 or -0 flag at the end:
  expect(sentryTraceContent).toMatch(/^[a-f0-9]{32}-[a-f0-9]{16}$/);

  expect(baggageContent?.length).toBeGreaterThan(0);

  const traceId = sentryTraceContent!.split('-')[0];

  expect(baggageContent).toContain('sentry-environment=qa');
  expect(baggageContent).toContain(`sentry-trace_id=${traceId}`);
  // ensure baggage also doesn't contain a sampled flag
  expect(baggageContent).not.toContain('sentry-sampled=');
});
