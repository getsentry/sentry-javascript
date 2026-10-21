import { expect } from '@playwright/test';
import { SDK_VERSION, SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE } from '@sentry/core';
import {
  SENTRY_IDLE_SPAN_FINISH_REASON,
  SENTRY_SEGMENT_ID,
  SENTRY_IS_LOCALHOST,
  CULTURE_CALENDAR,
  CULTURE_LOCALE,
  CULTURE_TIMEZONE,
  DEVICE_PROCESSOR_COUNT,
  NETWORK_CONNECTION_EFFECTIVE_TYPE,
  NETWORK_CONNECTION_RTT,
  SENTRY_SDK_NAME,
  SENTRY_SDK_VERSION,
  SENTRY_SEGMENT_NAME,
  SENTRY_LINK_TYPE,
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
    [SENTRY_IDLE_SPAN_FINISH_REASON]: { type: 'string', value: 'idleTimeout' },
  });
  expect(pageloadSpan.span_id).not.toBe(navigationSpan.span_id);
  await page.evaluate(() => (window as any).Sentry.flush());
  for (const root of [pageloadSpan, navigationSpan]) {
    collectedSpans
      .filter(span => !span.is_segment && span.attributes[SENTRY_SEGMENT_ID]?.value === root.span_id)
      .forEach(span => expect(span.parent_span_id).toBe(root.span_id));
  }

  expect(navigationSpan).toEqual({
    attributes: {
      [SENTRY_IS_LOCALHOST]: { value: false, type: 'boolean' },
      [SENTRY_TRACE_LIFECYCLE]: {
        type: 'string',
        value: 'stream',
      },
      [CULTURE_CALENDAR]: {
        type: 'string',
        value: expect.any(String),
      },
      [CULTURE_LOCALE]: {
        type: 'string',
        value: expect.any(String),
      },
      [CULTURE_TIMEZONE]: {
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
      [DEVICE_PROCESSOR_COUNT]: {
        type: expect.stringMatching(/^(integer)|(double)$/),
        value: expect.any(Number),
      },
      ...(browserName !== 'webkit' && {
        [NETWORK_CONNECTION_EFFECTIVE_TYPE]: {
          type: 'string',
          value: expect.any(String),
        },
        [NETWORK_CONNECTION_RTT]: {
          type: expect.stringMatching(/^(integer)|(double)$/),
          value: expect.any(Number),
        },
      }),
      [SENTRY_IDLE_SPAN_FINISH_REASON]: {
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
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: {
        type: 'integer',
        value: 1,
      },
      [SENTRY_SDK_NAME]: {
        type: 'string',
        value: 'sentry.javascript.browser',
      },
      [SENTRY_SDK_VERSION]: {
        type: 'string',
        value: SDK_VERSION,
      },
      [SENTRY_SDK_INTEGRATIONS]: {
        type: 'array',
        value: expect.arrayContaining(['BrowserTracing', 'SpanStreaming']),
      },
      [SENTRY_SEGMENT_ID]: {
        type: 'string',
        value: navigationSpan.span_id,
      },
      [SENTRY_SEGMENT_NAME]: {
        type: 'string',
        value: 'Navigation',
      },
      [SENTRY_SEGMENT_NAME_SOURCE]: {
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
          [SENTRY_LINK_TYPE]: {
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
    [SENTRY_IDLE_SPAN_FINISH_REASON]: { type: 'string', value: 'idleTimeout' },
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
    [SENTRY_IDLE_SPAN_FINISH_REASON]: { type: 'string', value: 'idleTimeout' },
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
    [SENTRY_IDLE_SPAN_FINISH_REASON]: {
      type: 'string',
      value: 'idleTimeout',
    },
  });
});
