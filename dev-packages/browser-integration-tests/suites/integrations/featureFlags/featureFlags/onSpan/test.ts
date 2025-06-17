import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';
import {
  type EventAndTraceHeader,
  eventAndTraceHeaderRequestParser,
  getMultipleSentryEnvelopeRequests,
  shouldSkipFeatureFlagsTest,
  shouldSkipTracingTest,
} from '../../../../../utils/helpers';
import { MAX_FLAGS_PER_SPAN } from '../../constants';

sentryTest("Feature flags are added to active span's attributes on span end.", async ({ getLocalTestUrl, page }) => {
  if (shouldSkipFeatureFlagsTest() || shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname, skipDsnRouteHandler: true });
  await page.goto(url);

  const envelopeRequestPromise = getMultipleSentryEnvelopeRequests<EventAndTraceHeader>(
    page,
    1,
    {},
    eventAndTraceHeaderRequestParser,
  );

  // withNestedSpans is a util used to start 3 nested spans: root-span (not recorded in transaction_event.spans), span, and nested-span.
  await page.evaluate(maxFlags => {
    (window as any).withNestedSpans(() => {
      const flagsIntegration = (window as any).Sentry.getClient().getIntegrationByName('FeatureFlags');
      for (let i = 1; i <= maxFlags; i++) {
        flagsIntegration.addFeatureFlag(`feat${i}`, false);
      }
      flagsIntegration.addFeatureFlag(`feat${maxFlags + 1}`, true); // dropped flag
      flagsIntegration.addFeatureFlag('feat3', true); // update
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

  const expectedOuterSpanFlags = [];
  for (let i = 1; i <= MAX_FLAGS_PER_SPAN; i++) {
    expectedOuterSpanFlags.push([`flag.evaluation.feat${i}`, i === 3]);
  }
  // Order agnostic (attribute dict is unordered).
  expect(outerSpanFlags.sort()).toEqual(expectedOuterSpanFlags.sort());
});
