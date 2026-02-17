import { expect } from '@playwright/test';
import { _INTERNAL_MAX_FLAGS_PER_SPAN as MAX_FLAGS_PER_SPAN } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import {
  type EventAndTraceHeader,
  eventAndTraceHeaderRequestParser,
  getMultipleSentryEnvelopeRequests,
  shouldSkipFeatureFlagsTest,
  shouldSkipTracingTest,
} from '../../../../../utils/helpers';

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

    const envelopeRequestPromise = getMultipleSentryEnvelopeRequests<EventAndTraceHeader>(
      page,
      1,
      {},
      eventAndTraceHeaderRequestParser,
    );

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

    const event = (await envelopeRequestPromise)[0][0];
    const innerSpan = event.spans?.[0];
    const outerSpan = event.spans?.[1];
    const outerSpanFlags = Object.entries(outerSpan?.data ?? {}).filter(([key, _val]) =>
      key.startsWith('flag.evaluation'),
    );
    const innerSpanFlags = Object.entries(innerSpan?.data ?? {}).filter(([key, _val]) =>
      key.startsWith('flag.evaluation'),
    );

    expect(innerSpanFlags).toEqual([]);

    const expectedOuterSpanFlags = [] as Array<[string, unknown]>;
    for (let i = 1; i <= MAX_FLAGS_PER_SPAN; i++) {
      expectedOuterSpanFlags.push([`flag.evaluation.feat${i}`, i === 3]);
    }
    expect(outerSpanFlags.sort()).toEqual(expectedOuterSpanFlags.sort());
  },
);
