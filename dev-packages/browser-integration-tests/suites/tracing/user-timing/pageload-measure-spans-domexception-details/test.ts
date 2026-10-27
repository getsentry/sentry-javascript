import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest(
  'captures measure details when another measure denies access',
  async ({ getLocalTestUrl, page, browserName }) => {
    sentryTest.skip(shouldSkipTracingTest() || browserName === 'webkit');
    const spans = collectStreamedSpans(page);
    const pageloadPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');
    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);
    const pageload = await pageloadPromise;
    await page.evaluate(() => (window as any).Sentry.flush());

    const measures = spans.filter(span => getSpanOp(span) === 'measure');
    expect(measures).toHaveLength(3);
    measures.forEach(span => {
      expect(span.parent_span_id).toBe(pageload.span_id);
      expect(span.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: 'auto.browser.user_timing.measure' });
    });
    const restricted = measures.find(span => span.name === 'restricted-test-measure')!;
    expect(Object.keys(restricted.attributes).filter(key => key.includes('detail'))).toHaveLength(0);

    const normal = measures.find(span => span.name === 'normal-measure')!;
    expect(normal.attributes['sentry.browser.measure.detail']).toEqual({ type: 'string', value: 'this-should-work' });

    const complex = measures.find(span => span.name === 'complex-detail-measure')!;
    expect(complex.attributes['sentry.browser.measure.detail.nested']).toEqual({
      type: 'string',
      value: JSON.stringify({ array: [1, 2, 3], object: { key: 'value' } }),
    });
    expect(complex.attributes['sentry.browser.measure.detail.metadata']).toEqual({
      type: 'string',
      value: JSON.stringify({ type: 'test', version: '1.0', tags: ['complex', 'nested', 'object'] }),
    });
  },
);
