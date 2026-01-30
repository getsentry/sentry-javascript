import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest, testingCdnBundle } from '../../../utils/helpers';
import { getSpanOp, waitForV2Spans } from '../../../utils/spanFirstUtils';

sentryTest('ends pageload span when the page goes to background', async ({ getLocalTestUrl, page }) => {
  // for now, spanStreamingIntegration is only exported in the NPM package, so we skip the test for bundles.
  if (shouldSkipTracingTest() || testingCdnBundle()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const spanPromise = waitForV2Spans(page, spans => !!spans.find(span => getSpanOp(span) === 'pageload'));

  await page.goto(url);
  await page.locator('#go-background').click();

  const pageloadSpan = (await spanPromise).find(span => getSpanOp(span) === 'pageload');

  expect(pageloadSpan?.status).toBe('error'); // a cancelled span previously mapped to status error with message cancelled.
  expect(pageloadSpan?.attributes?.['sentry.op']?.value).toBe('pageload');
  expect(pageloadSpan?.attributes?.['sentry.cancellation_reason']?.value).toBe('document.hidden');
});
