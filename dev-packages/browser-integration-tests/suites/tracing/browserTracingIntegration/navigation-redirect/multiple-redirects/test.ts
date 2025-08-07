import { expect } from '@playwright/test';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../../utils/helpers';

sentryTest(
  'creates a pageload and navigation root spans each with multiple navigation.redirect childspans',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadRequestPromise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === 'pageload');
    const navigationRequestPromise = waitForTransactionRequest(
      page,
      event => event.contexts?.trace?.op === 'navigation' && event.transaction === '/next-page',
    );

    await page.goto(url);

    const pageloadRequest = envelopeRequestParser(await pageloadRequestPromise);
    const navigationRequest = envelopeRequestParser(await navigationRequestPromise);

    expect(pageloadRequest.contexts?.trace?.op).toBe('pageload');

    expect(pageloadRequest.contexts?.trace?.data).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.browser',
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
      ['sentry.idle_span_finish_reason']: 'cancelled',
    });

    expect(pageloadRequest.request).toEqual({
      headers: {
        'User-Agent': expect.any(String),
      },
      url: 'http://sentry-test.io/index.html',
    });

    const spans = pageloadRequest.spans || [];

    const redirectSpans = spans.filter(span => span.op === 'navigation.redirect');
    expect(redirectSpans).toHaveLength(3);

    redirectSpans.forEach(redirectSpan => {
      expect(redirectSpan?.timestamp).toEqual(redirectSpan?.start_timestamp);
      expect(redirectSpan).toEqual({
        data: {
          'sentry.op': 'navigation.redirect',
          'sentry.origin': 'auto.navigation.browser',
          'sentry.source': 'url',
        },
        description: expect.stringContaining('/sub-page-redirect-'),
        op: 'navigation.redirect',
        origin: 'auto.navigation.browser',
        parent_span_id: pageloadRequest.contexts!.trace!.span_id,
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
      });
    });

    expect(navigationRequest.contexts?.trace?.op).toBe('navigation');
    expect(navigationRequest.transaction).toEqual('/next-page');

    // 2 subsequent redirects belonging to the navigation root span
    expect(navigationRequest.spans?.filter(span => span.op === 'navigation.redirect')).toHaveLength(2);
  },
);
