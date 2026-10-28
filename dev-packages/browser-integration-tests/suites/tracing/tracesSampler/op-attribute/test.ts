import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpanAndTraceHeaderOnUrl } from '../../../../utils/spanUtils';

sentryTest('tracesSampler can sample based on the `sentry.op` attribute', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  // The sampler drops `other.op` and keeps `custom.op`, so the only transaction
  // that arrives is the one whose op the sampler saw in the attributes.
  const [span] = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url);

  expect(span.is_segment).toBe(true);
  expect(span.name).toBe('span-with-sampled-op');
  expect(getSpanOp(span)).toBe('custom.op');
});
