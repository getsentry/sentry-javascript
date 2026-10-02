import { expect } from '@playwright/test';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
} from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../../utils/spanUtils';
import { SENTRY_SEGMENT_NAME_SOURCE, URL_FULL, URL_PATH } from '@sentry/conventions/attributes';

sentryTest(
  'creates a pageload and navigation root spans each with multiple navigation.redirect childspans',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const allSpans = collectStreamedSpans(page);
    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
    const navigationSpanPromise = waitForStreamedSpan(
      page,
      span => getSpanOp(span) === 'navigation' && span.attributes['url.path']?.value === '/next-page',
    );

    await page.goto(url);

    const pageloadSpan = await pageloadSpanPromise;
    const navigationSpan = await navigationSpanPromise;
    await page.evaluate(() => (window as any).Sentry.flush());

    expect(getSpanOp(pageloadSpan)).toBe('pageload');

    expect(pageloadSpan.attributes).toMatchObject({
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.pageload.browser' },
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: { type: 'integer', value: 1 },
      [SENTRY_SEGMENT_NAME_SOURCE]: { type: 'string', value: 'url' },
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'pageload' },
      ['sentry.idle_span_finish_reason']: { type: 'string', value: 'cancelled' },
    });

    expect(pageloadSpan.attributes).toMatchObject({
      'user_agent.original': { type: 'string', value: expect.any(String) },
      'url.full': { type: 'string', value: 'http://sentry-test.io/index.html' },
    });

    const spans = allSpans.filter(span => span.attributes['sentry.segment.id']?.value === pageloadSpan.span_id);

    const redirectSpans = spans.filter(span => getSpanOp(span) === 'navigation.redirect');
    expect(redirectSpans).toHaveLength(3);

    redirectSpans.forEach(redirectSpan => {
      expect(redirectSpan?.end_timestamp).toEqual(redirectSpan?.start_timestamp);
      expect(redirectSpan).toMatchObject({
        attributes: {
          'sentry.op': { type: 'string', value: 'navigation.redirect' },
          'sentry.origin': { type: 'string', value: 'auto.navigation.browser' },
          'sentry.segment.id': { type: 'string', value: pageloadSpan.span_id },
          'sentry.segment.name': { type: 'string', value: 'Pageload' },
          [URL_FULL]: { type: 'string', value: expect.any(String) },
          [URL_PATH]: { type: 'string', value: expect.any(String) },
        },
        name: 'Navigation',
        is_segment: false,
        status: 'ok',
        parent_span_id: pageloadSpan.span_id,
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        end_timestamp: expect.any(Number),
        trace_id: expect.any(String),
      });
    });

    expect(getSpanOp(navigationSpan)).toBe('navigation');
    expect(navigationSpan.name).toEqual('Navigation');
    expect(navigationSpan.attributes['url.path']?.value).toEqual('/next-page');

    // 2 subsequent redirects belonging to the navigation root span
    expect(
      allSpans
        .filter(span => span.attributes['sentry.segment.id']?.value === navigationSpan.span_id)
        .filter(span => getSpanOp(span) === 'navigation.redirect'),
    ).toHaveLength(2);
  },
);
