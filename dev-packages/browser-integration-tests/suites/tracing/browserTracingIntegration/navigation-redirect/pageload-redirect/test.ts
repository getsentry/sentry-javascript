import { expect } from '@playwright/test';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../../utils/helpers';
import { URL_FULL, URL_PATH, SENTRY_OP } from '@sentry/conventions/attributes';

sentryTest('creates a pageload root span with navigation.redirect childspan', async ({ getLocalTestUrl, page }) => {
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
    [SENTRY_OP]: 'pageload',
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

  const redirectSpan = spans.find(span => span.op === 'navigation.redirect');
  expect(redirectSpan?.timestamp).toEqual(redirectSpan?.start_timestamp);
  expect(redirectSpan).toEqual({
    data: {
      [SENTRY_OP]: 'navigation.redirect',
      'sentry.origin': 'auto.navigation.browser',
      'sentry.source': 'url',
      [URL_FULL]: 'http://sentry-test.io/sub-page',
      [URL_PATH]: '/sub-page',
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
