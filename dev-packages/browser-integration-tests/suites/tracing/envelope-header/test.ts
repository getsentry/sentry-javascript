import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { waitForStreamedSpanAndTraceHeaderOnUrl } from '../../../utils/spanUtils';

sentryTest(
  'should send dynamic sampling context data in trace envelope header of a streamed span envelope',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const [, traceHeader] = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url);

    // In this test, we don't expect trace.transaction to be present because without a custom routing instrumentation
    // we for now don't have parameterization. This might change in the future but for now the only way of having
    // transaction in DSC with the default browserTracingIntegration is when the transaction name is set manually.
    // This scenario is covered in another integration test (envelope-header-transaction-name).
    expect(traceHeader).toBeDefined();
    expect(traceHeader).toEqual({
      environment: 'production',
      sample_rate: '1',
      trace_id: expect.stringMatching(/[a-f\d]{32}/),
      public_key: 'public',
      sampled: 'true',
      sample_rand: expect.any(String),
    });
  },
);
