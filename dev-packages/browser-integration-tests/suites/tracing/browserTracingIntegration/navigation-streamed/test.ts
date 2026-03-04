import { expect } from '@playwright/test';
import {
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest, testingCdnBundle } from '../../../../utils/helpers';
import {
  getSpanOp,
  getSpansFromEnvelope,
  waitForStreamedSpan,
  waitForStreamedSpanEnvelope,
} from '../../../../utils/spanUtils';

sentryTest('starts a streamed navigation span on page navigation', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest() || testingCdnBundle());

  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
  const navigationSpanEnvelopePromise = waitForStreamedSpanEnvelope(
    page,
    env => !!getSpansFromEnvelope(env).find(s => getSpanOp(s) === 'navigation'),
  );

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const pageloadSpan = await pageloadSpanPromise;

  // simulate navigation
  page.goto(`${url}#foo`);

  const navigationSpanEnvelope = await navigationSpanEnvelopePromise;

  const navigationSpanEnvelopeHeader = navigationSpanEnvelope[0];
  const navigationSpanEnvelopeItem = navigationSpanEnvelope[1];
  const navigationSpans = navigationSpanEnvelopeItem[0][1].items;
  const navigationSpan = navigationSpans.find(s => getSpanOp(s) === 'navigation')!;

  expect(navigationSpanEnvelopeHeader).toEqual({
    sent_at: expect.any(String),
    trace: {
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      environment: 'production',
      public_key: 'public',
      sample_rand: expect.any(String),
      sample_rate: '1',
      sampled: 'true',
    },
    sdk: {
      name: 'sentry.javascript.browser',
      version: SDK_VERSION,
    },
  });

  const numericSampleRand = parseFloat(navigationSpanEnvelopeHeader.trace!.sample_rand!);
  expect(Number.isNaN(numericSampleRand)).toBe(false);

  const pageloadTraceId = pageloadSpan.trace_id;
  const navigationTraceId = navigationSpan.trace_id;

  expect(pageloadTraceId).toBeDefined();
  expect(navigationTraceId).toBeDefined();
  expect(pageloadTraceId).not.toEqual(navigationTraceId);

  expect(pageloadSpan.name).toEqual('/index.html');

  expect(navigationSpan).toEqual({
    attributes: {
      effectiveConnectionType: {
        type: 'string',
        value: expect.any(String),
      },
      hardwareConcurrency: {
        type: 'string',
        value: expect.any(String),
      },
      'sentry.idle_span_finish_reason': {
        type: 'string',
        value: 'idleTimeout',
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: {
        type: 'string',
        value: 'navigation',
      },
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: {
        type: 'string',
        value: 'auto.navigation.browser',
      },
      'sentry.previous_trace': {
        type: 'string',
        value: `${pageloadTraceId}-${pageloadSpan.span_id}-1`,
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
        value: SDK_VERSION,
      },
      'sentry.segment.id': {
        type: 'string',
        value: navigationSpan.span_id,
      },
      'sentry.segment.name': {
        type: 'string',
        value: '/index.html',
      },
      'sentry.source': {
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
    links: [
      {
        attributes: {
          'sentry.link.type': {
            type: 'string',
            value: 'previous_trace',
          },
        },
        sampled: true,
        span_id: pageloadSpan.span_id,
        trace_id: pageloadTraceId,
      },
    ],
    name: '/index.html',
    span_id: navigationSpan.span_id,
    start_timestamp: expect.any(Number),
    status: 'ok',
    trace_id: navigationTraceId,
  });
});

sentryTest('handles pushState with full URL', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest() || testingCdnBundle());

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
  const navigationSpan1Promise = waitForStreamedSpan(
    page,
    span => getSpanOp(span) === 'navigation' && span.name === '/sub-page',
  );
  const navigationSpan2Promise = waitForStreamedSpan(
    page,
    span => getSpanOp(span) === 'navigation' && span.name === '/sub-page-2',
  );

  await page.goto(url);
  await pageloadSpanPromise;

  await page.evaluate("window.history.pushState({}, '', `${window.location.origin}/sub-page`);");

  const navigationSpan1 = await navigationSpan1Promise;

  expect(navigationSpan1.name).toEqual('/sub-page');

  expect(navigationSpan1.attributes).toMatchObject({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: {
      type: 'string',
      value: 'auto.navigation.browser',
    },
    [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: {
      type: 'integer',
      value: 1,
    },
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: {
      type: 'string',
      value: 'url',
    },
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: {
      type: 'string',
      value: 'navigation',
    },
  });

  await page.evaluate("window.history.pushState({}, '', `${window.location.origin}/sub-page-2`);");

  const navigationSpan2 = await navigationSpan2Promise;

  expect(navigationSpan2.name).toEqual('/sub-page-2');

  expect(navigationSpan2.attributes).toMatchObject({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: {
      type: 'string',
      value: 'auto.navigation.browser',
    },
    [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: {
      type: 'integer',
      value: 1,
    },
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: {
      type: 'string',
      value: 'url',
    },
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: {
      type: 'string',
      value: 'navigation',
    },
    ['sentry.idle_span_finish_reason']: {
      type: 'string',
      value: 'idleTimeout',
    },
  });
});
