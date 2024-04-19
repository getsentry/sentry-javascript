import { expect } from '@playwright/test';
import type { SpanEnvelope } from '@sentry/types';

import { sentryTest } from '../../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  properFullEnvelopeRequestParser,
  shouldSkipTracingTest,
} from '../../../../../utils/helpers';

sentryTest('sends a span envelope with is_segment: false', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });
  const spanEnvelope = await getFirstSentryEnvelopeRequest<SpanEnvelope>(page, url, properFullEnvelopeRequestParser);

  const headers = spanEnvelope[0];
  const item = spanEnvelope[1][0];

  const itemHeader = item[0];
  const spanJson = item[1];

  expect(headers).toEqual({
    sent_at: expect.any(String),
  });

  expect(itemHeader).toEqual({
    type: 'span',
  });

  expect(spanJson).toEqual({
    data: {
      'sentry.origin': 'manual',
      'sentry.sample_rate': 1,
      'sentry.source': 'custom',
    },
    description: 'standalone_segment_span',
    origin: 'manual',
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
    is_segment: false,
  });
});
