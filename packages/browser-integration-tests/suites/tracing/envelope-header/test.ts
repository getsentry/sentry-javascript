import { expect } from '@playwright/test';
import type { EventEnvelopeHeaders } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeHeaderRequestParser, getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest(
  'should send dynamic sampling context data in trace envelope header of a transaction envelope',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    const envHeader = await getFirstSentryEnvelopeRequest<EventEnvelopeHeaders>(page, url, envelopeHeaderRequestParser);

    // In this test, we don't expect trace.transaction to be present because without a custom routing instrumentation
    // we for now don't have parameterization. This might change in the future but for now the only way of having
    // transaction in DSC with the default BrowserTracing integration is when the transaction name is set manually.
    // This scenario is covered in another integration test (envelope-header-transaction-name).
    expect(envHeader.trace).toBeDefined();
    expect(envHeader.trace).toEqual({
      environment: 'production',
      user_segment: 'segmentB',
      sample_rate: '1',
      trace_id: expect.any(String),
      public_key: 'public',
    });
  },
);
