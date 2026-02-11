import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  getFirstSentryEnvelopeRequest,
  shouldSkipTracingTest,
  waitForTransactionRequest,
} from '../../../../utils/helpers';

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

  expect(pageloadRequest.transaction).toEqual('/index.html');
  // Fragment is not in transaction name
  expect(navigationRequest.transaction).toEqual('/index.html');

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
  expect(pageloadRequest.request).toEqual({
    headers: {
      'User-Agent': expect.any(String),
    },
    url: 'http://sentry-test.io/index.html',
  });
  expect(navigationRequest.request).toEqual({
    headers: {
      'User-Agent': expect.any(String),
    },
    url: 'http://sentry-test.io/index.html#foo',
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

//
sentryTest('should handle pushState with full URL', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadRequestPromise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === 'pageload');
  const navigationRequestPromise = waitForTransactionRequest(
    page,
    event => event.contexts?.trace?.op === 'navigation' && event.transaction === '/sub-page',
  );
  const navigationRequestPromise2 = waitForTransactionRequest(
    page,
    event => event.contexts?.trace?.op === 'navigation' && event.transaction === '/sub-page-2',
  );

  await page.goto(url);
  await pageloadRequestPromise;

  await page.evaluate("window.history.pushState({}, '', `${window.location.origin}/sub-page`);");

  const navigationRequest = envelopeRequestParser(await navigationRequestPromise);

  expect(navigationRequest.transaction).toEqual('/sub-page');

  expect(navigationRequest.contexts?.trace?.data).toMatchObject({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.browser',
    [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
    ['sentry.idle_span_finish_reason']: 'idleTimeout',
  });
  expect(navigationRequest.request).toEqual({
    headers: {
      'User-Agent': expect.any(String),
    },
    url: 'http://sentry-test.io/sub-page',
  });

  await page.evaluate("window.history.pushState({}, '', `${window.location.origin}/sub-page-2`);");

  const navigationRequest2 = envelopeRequestParser(await navigationRequestPromise2);

  expect(navigationRequest2.transaction).toEqual('/sub-page-2');

  expect(navigationRequest2.contexts?.trace?.data).toMatchObject({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.browser',
    [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
    ['sentry.idle_span_finish_reason']: 'idleTimeout',
  });
  expect(navigationRequest2.request).toEqual({
    headers: {
      'User-Agent': expect.any(String),
    },
    url: 'http://sentry-test.io/sub-page-2',
  });
});
