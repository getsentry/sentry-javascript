import { expect } from '@playwright/test';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../../utils/helpers';

sentryTest('should create a pageload transaction with navigation.redirect span', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadRequestPromise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === 'pageload');

  await page.goto(url);

  const pageloadRequest = envelopeRequestParser(await pageloadRequestPromise);

  expect(pageloadRequest.contexts?.trace?.op).toBe('pageload');

  expect(pageloadRequest.contexts?.trace?.data).toMatchObject({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.browser',
    [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
    ['sentry.idle_span_finish_reason']: 'idleTimeout',
  });

  expect(pageloadRequest.request).toEqual({
    headers: {
      'User-Agent': expect.any(String),
    },
    url: 'http://sentry-test.io/index.html',
  });

  const spans = pageloadRequest.spans || [];

  expect(spans).toContainEqual(
    expect.objectContaining({
      op: 'navigation.redirect',
    }),
  );

  const navigationSpan = spans.find(span => span.op === 'navigation.redirect');
  expect(navigationSpan?.timestamp).toEqual(navigationSpan?.start_timestamp);
  expect(navigationSpan).toEqual({
    data: {
      'sentry.op': 'navigation.redirect',
      'sentry.origin': 'auto.navigation.browser',
      'sentry.source': 'url',
    },
    description: '/sub-page',
    op: 'navigation.redirect',
    origin: 'auto.navigation.browser',
    parent_span_id: pageloadRequest.contexts!.trace!.span_id,
    span_id: expect.any(String),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: expect.any(String),
  });
});
