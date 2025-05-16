import { expect } from '@playwright/test';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest(
  'should create a navigation transaction that aborts an ongoing pageload',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadRequestPromise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === 'pageload');
    const navigationRequestPromise = waitForTransactionRequest(
      page,
      event => event.contexts?.trace?.op === 'navigation',
    );

    await page.goto(url);

    const pageloadRequest = envelopeRequestParser(await pageloadRequestPromise);
    const navigationRequest = envelopeRequestParser(await navigationRequestPromise);

    expect(pageloadRequest.contexts?.trace?.op).toBe('pageload');
    expect(navigationRequest.contexts?.trace?.op).toBe('navigation');

    expect(navigationRequest.transaction_info?.source).toEqual('url');

    const pageloadTraceId = pageloadRequest.contexts?.trace?.trace_id;
    const navigationTraceId = navigationRequest.contexts?.trace?.trace_id;

    expect(pageloadTraceId).toBeDefined();
    expect(navigationTraceId).toBeDefined();
    expect(pageloadTraceId).not.toEqual(navigationTraceId);

    expect(pageloadRequest.transaction).toEqual('/index.html');
    expect(navigationRequest.transaction).toEqual('/sub-page');

    expect(pageloadRequest.contexts?.trace?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.browser',
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
      ['sentry.idle_span_finish_reason']: 'cancelled',
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
      url: 'http://sentry-test.io/sub-page',
    });
  },
);
