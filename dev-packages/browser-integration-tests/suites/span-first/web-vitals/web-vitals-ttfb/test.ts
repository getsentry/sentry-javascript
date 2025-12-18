import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest, testingCdnBundle } from '../../../../utils/helpers';
import { getSpanOp, waitForV2Spans } from '../../../../utils/spanFirstUtils';

sentryTest('captures TTFB web vital', async ({ getLocalTestUrl, page }) => {
  // for now, spanStreamingIntegration is only exported in the NPM package, so we skip the test for bundles.
  if (shouldSkipTracingTest() || testingCdnBundle()) {
    sentryTest.skip();
  }
  const pageloadSpansPromise = waitForV2Spans(page, spans => !!spans.find(span => getSpanOp(span) === 'pageload'));

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const pageloadSpan = (await pageloadSpansPromise).find(span => getSpanOp(span) === 'pageload');

  expect(pageloadSpan).toBeDefined();

  // If responseStart === 0, ttfb is not reported
  // This seems to happen somewhat randomly, so we just ignore this in that case
  const responseStart = await page.evaluate("performance.getEntriesByType('navigation')[0].responseStart;");
  if (responseStart !== 0) {
    expect(pageloadSpan!.attributes?.['ui.web_vital.ttfb']).toEqual({
      type: expect.stringMatching(/^(integer)|(double)$/),
      value: expect.any(Number),
    });
  }

  expect(pageloadSpan!.attributes?.['ui.web_vital.ttfb.requestTime']).toEqual({
    type: expect.stringMatching(/^(integer)|(double)$/),
    value: expect.any(Number),
  });
});
