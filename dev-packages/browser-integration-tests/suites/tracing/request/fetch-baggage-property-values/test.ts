import { expect } from '@playwright/test';
import { TRACEPARENT_REGEXP } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'preserves baggage property values with equal signs in fetch requests',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const requestPromise = page.waitForRequest('http://sentry-test-site.example/fetch-test');

    await page.goto(url);
    await page.click('#fetchButton');

    const request = await requestPromise;

    const requestHeaders = request.headers();

    expect(requestHeaders).toMatchObject({
      'sentry-trace': expect.stringMatching(TRACEPARENT_REGEXP),
    });

    const baggageHeader = requestHeaders.baggage;
    expect(baggageHeader).toBeDefined();

    const baggageItems = baggageHeader.split(',').map(item => decodeURIComponent(item.trim()));

    // Verify property values with = signs are preserved
    expect(baggageItems).toContainEqual(expect.stringContaining('key1=value1;property1;property2'));
    expect(baggageItems).toContainEqual(expect.stringContaining('key2=value2'));
    expect(baggageItems).toContainEqual(expect.stringContaining('key3=value3; propertyKey=propertyValue'));

    // Verify Sentry baggage is also present
    expect(baggageHeader).toMatch(/sentry-/);
  },
);
