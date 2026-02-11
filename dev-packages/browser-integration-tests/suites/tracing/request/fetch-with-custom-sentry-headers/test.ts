import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest("instrumentation doesn't override manually added sentry headers", async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const requestPromise = page.waitForRequest('http://sentry-test-site.example/api/test/');

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  const request = await requestPromise;

  const headers = await request.allHeaders();

  expect(headers['sentry-trace']).toBe('abc-123-1');
  expect(headers.baggage).toBe('sentry-trace_id=abc');
});
