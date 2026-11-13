import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { URL_FULL } from '@sentry/conventions/attributes';
import { PAGELOAD, RESOURCE_SCRIPT } from '@sentry/conventions/op';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('only emits resource spans with a duration >= resourceMinDuration', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const fulfillScript = (route: Route): Promise<void> =>
    route.fulfill({
      body: '',
      headers: { 'Timing-Allow-Origin': '*', 'Content-Type': 'application/javascript' },
    });

  await page.route('https://sentry-test-site.example/path/to/fast.js', fulfillScript);
  await page.route('https://sentry-test-site.example/path/to/slow.js', async route => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    await fulfillScript(route);
  });

  const spans = collectStreamedSpans(page);
  const pageloadPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === PAGELOAD);
  await page.goto(await getLocalTestUrl({ testDir: __dirname }));
  await pageloadPromise;
  await page.evaluate(() => (window as any).Sentry.flush());

  const scriptUrls = spans
    .filter(span => getSpanOp(span) === RESOURCE_SCRIPT)
    .map(span => span.attributes[URL_FULL]?.value);

  expect(scriptUrls).toContain('https://sentry-test-site.example/path/to/slow.js');
  expect(scriptUrls).not.toContain('https://sentry-test-site.example/path/to/fast.js');
});
