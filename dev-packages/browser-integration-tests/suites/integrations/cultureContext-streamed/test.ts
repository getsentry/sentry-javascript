import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { getSpanOp, waitForStreamedSpans } from '../../../utils/spanUtils';
import { shouldSkipTracingTest, testingCdnBundle } from '../../../utils/helpers';

sentryTest('cultureContextIntegration captures locale, timezone, and calendar', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest() || testingCdnBundle());
  const url = await getLocalTestUrl({ testDir: __dirname });

  const spansPromise = waitForStreamedSpans(page, spans => spans.some(s => getSpanOp(s) === 'pageload'));

  await page.goto(url);

  const spans = await spansPromise;

  const pageloadSpan = spans.find(s => getSpanOp(s) === 'pageload');

  expect(pageloadSpan!.attributes?.['culture.locale']).toEqual({ type: 'string', value: expect.any(String) });
  expect(pageloadSpan!.attributes?.['culture.timezone']).toEqual({ type: 'string', value: expect.any(String) });
  expect(pageloadSpan!.attributes?.['culture.calendar']).toEqual({ type: 'string', value: expect.any(String) });
});
