import { expect } from '@playwright/test';
import { EventEnvelopeHeaders } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeHeaderRequestParser, getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest(
  'should not send user_id in DSC data in trace envelope header if sendDefaultPii option is not set',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    const envHeader = await getFirstSentryEnvelopeRequest<EventEnvelopeHeaders>(page, url, envelopeHeaderRequestParser);

    expect(envHeader.trace).toBeDefined();
    expect(envHeader.trace).toEqual({
      environment: 'production',
      transaction: expect.stringContaining('index.html'),
      user_segment: 'segmentB',
      sample_rate: '1',
      trace_id: expect.any(String),
      public_key: 'public',
    });
  },
);
