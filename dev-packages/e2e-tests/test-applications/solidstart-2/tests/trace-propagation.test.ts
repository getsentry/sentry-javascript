import { expect, test } from '@playwright/test';

test('injects trace meta tags on pageload', async ({ page }) => {
  await page.goto('/');

  const sentryTraceContent = await page.getAttribute('meta[name="sentry-trace"]', 'content');
  expect(sentryTraceContent).toMatch(/^[a-f0-9]{32}-[a-f0-9]{16}-[01]$/);

  const baggageContent = await page.getAttribute('meta[name="baggage"]', 'content');
  expect(baggageContent).toContain('sentry-trace_id=');
});
