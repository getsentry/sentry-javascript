import { expect } from '@playwright/test';
import { _INTERNAL_MAX_FLAGS_PER_SPAN as MAX_FLAGS_PER_SPAN } from '@sentry/core';
import { waitForStreamedSpan } from '../../../../../utils/spanUtils';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipFeatureFlagsTest, shouldSkipTracingTest } from '../../../../../utils/helpers';

sentryTest(
  "GrowthBook onSpan: flags are added to active span's attributes on span end",
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipFeatureFlagsTest() || shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    await page.route(/^https:\/\/dsn\.ingest\.sentry\.io\//, route => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    const url = await getLocalTestUrl({ testDir: __dirname, skipDsnRouteHandler: true });
    await page.goto(url);

    const innerSpanPromise = waitForStreamedSpan(page, span => span.name === 'test-nested-span');
    const outerSpanPromise = waitForStreamedSpan(page, span => span.name === 'test-span');

    await page.evaluate(maxFlags => {
      (window as any).withNestedSpans(() => {
        const gb = new (window as any).GrowthBook();
        for (let i = 1; i <= maxFlags; i++) {
          gb.isOn(`feat${i}`);
        }
        gb.__setOn(`feat${maxFlags + 1}`, true);
        gb.isOn(`feat${maxFlags + 1}`); // dropped
        gb.__setOn('feat3', true);
        gb.isOn('feat3'); // update
      });
      return true;
    }, MAX_FLAGS_PER_SPAN);

    const [innerSpan, outerSpan] = await Promise.all([innerSpanPromise, outerSpanPromise]);
    const outerSpanFlags = Object.entries(outerSpan.attributes).filter(([key, _val]) =>
      key.startsWith('flag.evaluation'),
    );
    const innerSpanFlags = Object.entries(innerSpan.attributes).filter(([key, _val]) =>
      key.startsWith('flag.evaluation'),
    );

    expect(outerSpanFlags).toEqual([]);

    const expectedInnerSpanFlags = [] as Array<[string, unknown]>;
    for (let i = 1; i <= MAX_FLAGS_PER_SPAN; i++) {
      expectedInnerSpanFlags.push([`flag.evaluation.feat${i}`, { type: 'boolean', value: i === 3 }]);
    }
    expect(innerSpanFlags.sort()).toEqual(expectedInnerSpanFlags.sort());
  },
);
