import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { getSpanOp, waitForSpanV2Envelope } from '../../../utils/spanFirstUtils';

sentryTest('sends a span v2 envelope for the pageload', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const spanEnvelopePromise = waitForSpanV2Envelope(page);

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  const spanEnvelope = await spanEnvelopePromise;

  const envelopeHeaders = spanEnvelope[0];

  const envelopeItem0 = spanEnvelope[1][0];
  const envelopeItemHeader = envelopeItem0[0];
  const envelopeItem = envelopeItem0[1];

  expect(envelopeHeaders).toEqual({
    sent_at: expect.any(String),
    trace: {
      environment: 'production',
      public_key: 'public',
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      sampled: 'true',
      sample_rand: expect.any(String),
      sample_rate: '1',
    },
    sdk: {
      name: 'sentry.javascript.browser',
      packages: [
        {
          name: 'npm:@sentry/browser',
          version: expect.any(String),
        },
      ],
      version: expect.any(String),
      settings: {
        infer_ip: 'auto',
      },
    },
  });

  expect(envelopeItemHeader).toEqual({
    content_type: 'application/vnd.sentry.items.span.v2+json',
    item_count: expect.any(Number),
    type: 'span',
  });

  // test the shape of the item first, then the content
  expect(envelopeItem).toEqual({
    items: expect.any(Array),
  });

  expect(envelopeItem.items.length).toBe(envelopeItemHeader.item_count);

  const pageloadSpan = envelopeItem.items.find(item => getSpanOp(item) === 'pageload');

  expect(pageloadSpan).toBeDefined();

  expect(pageloadSpan).toEqual({
    attributes: expect.objectContaining({
      'performance.activationStart': {
        type: 'integer',
        value: 0,
      },
      'performance.timeOrigin': {
        type: 'double',
        value: expect.any(Number),
      },
      'sentry.op': {
        type: 'string',
        value: 'pageload',
      },
      'sentry.origin': {
        type: 'string',
        value: 'auto.pageload.browser',
      },
      'sentry.sample_rate': {
        type: 'integer',
        value: 1,
      },
      'sentry.sdk.name': {
        type: 'string',
        value: 'sentry.javascript.browser',
      },
      'sentry.sdk.version': {
        type: 'string',
        value: expect.any(String),
      },
      'sentry.segment.id': {
        type: 'string',
        value: pageloadSpan?.span_id, // pageload is always the segment
      },
      'sentry.segment.name': {
        type: 'string',
        value: '/index.html',
      },
      'sentry.source': {
        type: 'string',
        value: 'url',
      },
    }),
    trace_id: expect.stringMatching(/^[a-f\d]{32}$/),
    span_id: expect.stringMatching(/^[a-f\d]{16}$/),
    name: '/index.html',
    status: 'ok',
    is_segment: true,
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
  });
});
