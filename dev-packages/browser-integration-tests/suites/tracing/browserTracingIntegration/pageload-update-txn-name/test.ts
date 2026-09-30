import { SENTRY_SEGMENT_NAME_SOURCE, SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE } from '@sentry/browser';
import { SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpanAndTraceHeaderOnUrl } from '../../../../utils/spanUtils';

sentryTest(
  'sets the source to custom when updating the span name with `span.updateName`',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const spans = collectStreamedSpans(page);
    const [pageloadSpan] = await waitForStreamedSpanAndTraceHeaderOnUrl(
      page,
      url,
      span => getSpanOp(span) === 'pageload',
    );
    await page.evaluate(() => (window as any).Sentry.flush());

    const attributes = pageloadSpan.attributes;

    expect(attributes).toBeDefined();

    expect(pageloadSpan.name).toBe('new name');

    expect(pageloadSpan.attributes).toMatchObject({
      [SENTRY_ORIGIN]: { type: 'string', value: 'auto.pageload.browser' },
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: { type: 'integer', value: 1 },
      [SENTRY_SEGMENT_NAME_SOURCE]: { type: 'string', value: 'custom' },
      [SENTRY_OP]: { type: 'string', value: 'pageload' },
    });

    expect(attributes[SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]).toBeUndefined();

    expect(getSpanOp(pageloadSpan)).toBe('pageload');
    expect(spans.filter(span => !span.is_segment).length).toBeGreaterThan(0);
    expect(pageloadSpan.attributes['sentry.segment.name.source']?.value).toEqual('custom');
  },
);
