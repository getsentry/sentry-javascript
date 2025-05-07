import { expect } from '@playwright/test';
import { TRACEPARENT_REGEXP } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('merges `baggage` headers of pre-existing non-sentry XHR requests', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const requestPromise = page.waitForRequest('http://sentry-test-site.example/1');

  await page.goto(url);

  const request = await requestPromise;

  const requestHeaders = request.headers();
  expect(requestHeaders).toMatchObject({
    'sentry-trace': expect.stringMatching(TRACEPARENT_REGEXP),
    baggage: expect.stringMatching(/^someVendor-foo=bar, sentry-.*$/),
    'x-test-header': 'existing-header',
  });
});
