import { expect } from '@playwright/test';
import { SDK_VERSION, SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE } from '@sentry/core';
import {
  SENTRY_SEGMENT_NAME_SOURCE,
  SENTRY_TRACE_LIFECYCLE,
  URL_FULL,
  URL_PATH,
  USER_AGENT_ORIGINAL,
  SENTRY_ENVIRONMENT,
  SENTRY_SDK_INTEGRATIONS,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import {
  collectStreamedSpans,
  getSpanOp,
  getSpansFromEnvelope,
  waitForStreamedSpan,
  waitForStreamedSpanEnvelope,
} from '../../../../utils/spanUtils';

sentryTest('starts a streamed navigation span on page navigation', async ({ browserName, getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const collectedSpans = collectStreamedSpans(page);
  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
  const navigationSpanEnvelopePromise = waitForStreamedSpanEnvelope(
    page,
    env => !!getSpansFromEnvelope(env).find(s => getSpanOp(s) === 'navigation'),
  );

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const pageloadSpan = await pageloadSpanPromise;

  await page.goto(`${url}#foo`);

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

  expect(pageloadSpan.name).toEqual('Pageload');
  expect(pageloadSpan.attributes).toMatchObject({
    [URL_PATH]: { type: 'string', value: '/index.html' },
    [URL_FULL]: { type: 'string', value: 'http://sentry-test.io/index.html' },
    [SENTRY_ORIGIN]: { type: 'string', value: 'auto.pageload.browser' },
    [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: { type: 'integer', value: 1 },
    [SENTRY_SEGMENT_NAME_SOURCE]: { type: 'string', value: 'url' },
    'sentry.idle_span_finish_reason': { type: 'string', value: 'idleTimeout' },
  });
  expect(pageloadSpan.span_id).not.toBe(navigationSpan.span_id);
  await page.evaluate(() => (window as any).Sentry.flush());
  for (const root of [pageloadSpan, navigationSpan]) {
    collectedSpans
      .filter(span => !span.is_segment && span.attributes['sentry.segment.id']?.value === root.span_id)
      .forEach(span => expect(span.parent_span_id).toBe(root.span_id));
  }

  expect(navigationSpan).toEqual({
    attributes: {
      'sentry.is_localhost': { value: false, type: 'boolean' },
      [SENTRY_TRACE_LIFECYCLE]: {
        type: 'string',
        value: 'stream',
      },
      'culture.calendar': {
        type: 'string',
        value: expect.any(String),
      },
      'culture.locale': {
        type: 'string',
        value: expect.any(String),
      },
      'culture.timezone': {
        type: 'string',
        value: expect.any(String),
      },
      [USER_AGENT_ORIGINAL]: {
        type: 'string',
        value: expect.any(String),
      },
      [URL_FULL]: {
        type: 'string',
        value: 'http://sentry-test.io/index.html#foo',
      },
      [URL_PATH]: {
        type: 'string',
        value: '/index.html',
      },
      'device.processor_count': {
        type: expect.stringMatching(/^(integer)|(double)$/),
        value: expect.any(Number),
      },
      ...(browserName !== 'webkit' && {
        'network.connection.effective_type': {
          type: 'string',
          value: expect.any(String),
        },
        'network.connection.rtt': {
          type: expect.stringMatching(/^(integer)|(double)$/),
          value: expect.any(Number),
        },
      }),
      'sentry.idle_span_finish_reason': {
        type: 'string',
        value: 'idleTimeout',
      },
      [SENTRY_OP]: {
        type: 'string',
        value: 'navigation',
      },
      [SENTRY_ORIGIN]: {
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
      [SENTRY_SDK_INTEGRATIONS]: {
        type: 'array',
        value: expect.arrayContaining(['BrowserTracing', 'SpanStreaming']),
      },
      'sentry.segment.id': {
        type: 'string',
        value: navigationSpan.span_id,
      },
      'sentry.segment.name': {
        type: 'string',
        value: 'Navigation',
      },
      'sentry.segment.name.source': {
        type: 'string',
        value: 'url',
      },
      [SENTRY_ENVIRONMENT]: {
        type: 'string',
        value: 'production',
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
    name: 'Navigation',
    span_id: navigationSpan.span_id,
    start_timestamp: expect.any(Number),
    status: 'ok',
    trace_id: navigationTraceId,
  });
});

sentryTest('handles pushState with full URL', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
  const navigationSpan1Promise = waitForStreamedSpan(
    page,
    span => getSpanOp(span) === 'navigation' && span.attributes?.[URL_PATH]?.value === '/sub-page',
  );
  const navigationSpan2Promise = waitForStreamedSpan(
    page,
    span => getSpanOp(span) === 'navigation' && span.attributes?.[URL_PATH]?.value === '/sub-page-2',
  );

  await page.goto(url);
  await pageloadSpanPromise;

  await page.evaluate("window.history.pushState({}, '', `${window.location.origin}/sub-page`);");

  const navigationSpan1 = await navigationSpan1Promise;

  expect(navigationSpan1.name).toEqual('Navigation');
  expect(navigationSpan1.attributes).toMatchObject({
    [URL_FULL]: { type: 'string', value: 'http://sentry-test.io/sub-page' },
    [USER_AGENT_ORIGINAL]: { type: 'string', value: expect.any(String) },
    'sentry.idle_span_finish_reason': { type: 'string', value: 'idleTimeout' },
  });

  expect(navigationSpan1.attributes).toMatchObject({
    [URL_PATH]: {
      type: 'string',
      value: '/sub-page',
    },
    [SENTRY_ORIGIN]: {
      type: 'string',
      value: 'auto.navigation.browser',
    },
    [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: {
      type: 'integer',
      value: 1,
    },
    [SENTRY_SEGMENT_NAME_SOURCE]: {
      type: 'string',
      value: 'url',
    },
    [SENTRY_OP]: {
      type: 'string',
      value: 'navigation',
    },
  });

  await page.evaluate("window.history.pushState({}, '', `${window.location.origin}/sub-page-2`);");

  const navigationSpan2 = await navigationSpan2Promise;

  expect(navigationSpan2.name).toEqual('Navigation');
  expect(navigationSpan2.attributes).toMatchObject({
    [URL_FULL]: { type: 'string', value: 'http://sentry-test.io/sub-page-2' },
    [USER_AGENT_ORIGINAL]: { type: 'string', value: expect.any(String) },
    'sentry.idle_span_finish_reason': { type: 'string', value: 'idleTimeout' },
  });

  expect(navigationSpan2.attributes).toMatchObject({
    [URL_PATH]: {
      type: 'string',
      value: '/sub-page-2',
    },
    [SENTRY_ORIGIN]: {
      type: 'string',
      value: 'auto.navigation.browser',
    },
    [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: {
      type: 'integer',
      value: 1,
    },
    [SENTRY_SEGMENT_NAME_SOURCE]: {
      type: 'string',
      value: 'url',
    },
    [SENTRY_OP]: {
      type: 'string',
      value: 'navigation',
    },
    ['sentry.idle_span_finish_reason']: {
      type: 'string',
      value: 'idleTimeout',
    },
  });
});
