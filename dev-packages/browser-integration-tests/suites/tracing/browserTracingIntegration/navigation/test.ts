import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should create a navigation transaction on page navigation', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadRequest = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const navigationRequest = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#foo`);

  expect(pageloadRequest.contexts?.trace?.op).toBe('pageload');
  expect(navigationRequest.contexts?.trace?.op).toBe('navigation');

  expect(navigationRequest.transaction_info?.source).toEqual('url');

  const pageloadTraceId = pageloadRequest.contexts?.trace?.trace_id;
  const navigationTraceId = navigationRequest.contexts?.trace?.trace_id;

  expect(pageloadTraceId).toBeDefined();
  expect(navigationTraceId).toBeDefined();
  expect(pageloadTraceId).not.toEqual(navigationTraceId);

  expect(pageloadRequest.contexts?.trace?.data).toMatchObject({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.browser',
    [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
    ['sentry.idle_span_finish_reason']: 'idleTimeout',
  });
  expect(navigationRequest.contexts?.trace?.data).toMatchObject({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.browser',
    [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
    ['sentry.idle_span_finish_reason']: 'idleTimeout',
  });

  const pageloadSpans = pageloadRequest.spans;
  const navigationSpans = navigationRequest.spans;

  const pageloadSpanId = pageloadRequest.contexts?.trace?.span_id;
  const navigationSpanId = navigationRequest.contexts?.trace?.span_id;

  expect(pageloadSpanId).toBeDefined();
  expect(navigationSpanId).toBeDefined();

  pageloadSpans?.forEach(span =>
    expect(span).toMatchObject({
      parent_span_id: pageloadSpanId,
    }),
  );

  navigationSpans?.forEach(span =>
    expect(span).toMatchObject({
      parent_span_id: navigationSpanId,
    }),
  );

  expect(pageloadSpanId).not.toEqual(navigationSpanId);
});
