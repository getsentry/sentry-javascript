import { expect } from '@playwright/test';
import type { EventEnvelopeHeaders } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import {
  envelopeHeaderRequestParser,
  getFirstSentryEnvelopeRequest,
  shouldSkipTracingTest,
} from '../../../utils/helpers';

sentryTest(
  'should only include transaction name if source is better than an unparameterized URL',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const envHeader = await getFirstSentryEnvelopeRequest<EventEnvelopeHeaders>(page, url, envelopeHeaderRequestParser);

    expect(envHeader.trace).toBeDefined();
    expect(envHeader.trace).toEqual({
      environment: 'production',
      sample_rate: '1',
      transaction: expect.stringContaining('/index.html'),
      trace_id: expect.any(String),
      public_key: 'public',
      sampled: 'true',
    });
  },
);
