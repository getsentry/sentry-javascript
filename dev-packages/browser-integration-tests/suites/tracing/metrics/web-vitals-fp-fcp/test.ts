import { PAGELOAD, BROWSER_PAINT } from '@sentry/conventions/op';
import { BROWSER_WEB_VITAL_FP_VALUE, BROWSER_WEB_VITAL_FCP_VALUE } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

[
  { vital: 'fp', attribute: BROWSER_WEB_VITAL_FP_VALUE, name: 'first-paint', chromiumOnly: true },
  { vital: 'fcp', attribute: BROWSER_WEB_VITAL_FCP_VALUE, name: 'first-contentful-paint', chromiumOnly: false },
].forEach(({ vital, attribute, name, chromiumOnly }) => {
  sentryTest(`captures ${vital.toUpperCase()} and its paint span`, async ({ getLocalTestUrl, page, browserName }) => {
    sentryTest.skip(shouldSkipTracingTest() || (chromiumOnly && browserName !== 'chromium'));
    const spans = collectStreamedSpans(page);
    const pageloadPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === PAGELOAD);
    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);
    const pageload = await pageloadPromise;
    await page.evaluate(() => (window as any).Sentry.flush());

    expect(pageload.attributes[attribute]?.value).toBeGreaterThan(0);
    const paintSpans = spans.filter(span => span.name === name);
    expect(paintSpans).toHaveLength(1);
    expect(getSpanOp(paintSpans[0])).toBe(BROWSER_PAINT);
    expect(paintSpans[0].parent_span_id).toBe(pageload.span_id);
    expect(paintSpans[0].trace_id).toBe(pageload.trace_id);
  });
});
