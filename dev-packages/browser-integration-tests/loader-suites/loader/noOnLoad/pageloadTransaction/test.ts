import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('should create a pageload span', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const spanPromise = waitForStreamedSpan(page, s => getSpanOp(s) === 'pageload');
  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);
  const pageloadSpan = await spanPromise;

  const timeOrigin = await page.evaluate<number>('window._testBaseTimestamp');

  expect(pageloadSpan.start_timestamp).toBeCloseTo(timeOrigin, 1);

  expect(pageloadSpan.attributes?.['sentry.segment.name.source'].value).toEqual('url');
});
