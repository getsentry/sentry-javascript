import { expect } from '@playwright/test';
import {
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, getSpansFromEnvelope, waitForStreamedSpanEnvelope } from '../../../../utils/spanUtils';

sentryTest(
  'creates a pageload streamed span envelope with url as pageload span name source',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    const spanEnvelopePromise = waitForStreamedSpanEnvelope(
      page,
      env => !!getSpansFromEnvelope(env).find(s => getSpanOp(s) === 'pageload'),
    );

    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    const spanEnvelope = await spanEnvelopePromise;
    const envelopeHeader = spanEnvelope[0];
    const envelopeItem = spanEnvelope[1];
    const spans = envelopeItem[0][1].items;
    const pageloadSpan = spans.find(s => getSpanOp(s) === 'pageload');

    const timeOrigin = await page.evaluate<number>('window._testBaseTimestamp');

    expect(envelopeHeader).toEqual({
      sdk: {
        name: 'sentry.javascript.browser',
        version: SDK_VERSION,
      },
      sent_at: expect.any(String),
      trace: {
        environment: 'production',
        public_key: 'public',
        sample_rand: expect.any(String),
        sample_rate: '1',
        sampled: 'true',
        trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      },
    });

    const numericSampleRand = parseFloat(envelopeHeader.trace!.sample_rand!);
    const traceId = envelopeHeader.trace!.trace_id;

    expect(Number.isNaN(numericSampleRand)).toBe(false);

    expect(envelopeItem[0][0].item_count).toBeGreaterThan(1);

    expect(pageloadSpan?.start_timestamp).toBeCloseTo(timeOrigin, 1);

    expect(pageloadSpan).toEqual({
      attributes: {
        effectiveConnectionType: {
          type: 'string',
          value: expect.any(String),
        },
        hardwareConcurrency: {
          type: 'string',
          value: expect.any(String),
        },
        'performance.activationStart': {
          type: 'integer',
          value: expect.any(Number),
        },
        'performance.timeOrigin': {
          type: 'double',
          value: expect.any(Number),
        },
        'sentry.idle_span_finish_reason': {
          type: 'string',
          value: 'idleTimeout',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: {
          type: 'string',
          value: 'pageload',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: {
          type: 'string',
          value: 'auto.pageload.browser',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: {
          type: 'integer',
          value: 1,
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: {
          type: 'string',
          value: 'sentry.javascript.browser',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: {
          type: 'string',
          value: SDK_VERSION,
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: {
          type: 'string',
          value: pageloadSpan?.span_id,
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: {
          type: 'string',
          value: '/index.html',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: {
          type: 'string',
          value: 'url',
        },
        'sentry.span.source': {
          type: 'string',
          value: 'url',
        },
      },
      end_timestamp: expect.any(Number),
      is_segment: true,
      name: '/index.html',
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
      start_timestamp: expect.any(Number),
      status: 'ok',
      trace_id: traceId,
    });
  },
);
