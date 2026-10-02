import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { waitForStreamedSpanAndTraceHeaderOnUrl } from '../../../utils/spanUtils';

sentryTest(
  'should only include transaction name if source is better than an unparameterized URL',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const [, traceHeader] = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url);

    expect(traceHeader).toBeDefined();
    expect(traceHeader).toEqual({
      environment: 'production',
      sample_rate: '1',
      transaction: 'Pageload',
      trace_id: expect.stringMatching(/[a-f\d]{32}/),
      public_key: 'public',
      sampled: 'true',
      sample_rand: expect.any(String),
    });
  },
);
