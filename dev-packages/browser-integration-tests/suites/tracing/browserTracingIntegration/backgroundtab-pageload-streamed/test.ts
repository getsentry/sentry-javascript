import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest, testingCdnBundle } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('finishes streamed pageload span when the page goes background', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest() || testingCdnBundle());
  const url = await getLocalTestUrl({ testDir: __dirname });
  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');

  await page.goto(url);
  await page.locator('#go-background').click();
  const pageloadSpan = await pageloadSpanPromise;

  // TODO: Is this what we want?
  expect(pageloadSpan.status).toBe('ok');
  expect(pageloadSpan.attributes?.['sentry.cancellation_reason']?.value).toBe('document.hidden');
});
