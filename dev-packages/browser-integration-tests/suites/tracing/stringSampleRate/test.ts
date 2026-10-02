import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { waitForStreamedSpanAndTraceHeaderOnUrl } from '../../../utils/spanUtils';

sentryTest('parses a string sample rate', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const [span] = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url);

  expect(span.attributes['sentry.sample_rate']).toEqual({ type: 'integer', value: 1 });
});
