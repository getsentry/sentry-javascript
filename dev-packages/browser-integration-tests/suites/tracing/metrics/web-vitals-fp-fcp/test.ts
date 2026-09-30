import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

[
  { vital: 'fp', name: 'first-paint', chromiumOnly: true },
  { vital: 'fcp', name: 'first-contentful-paint', chromiumOnly: false },
].forEach(({ vital, name, chromiumOnly }) => {
  sentryTest(`captures ${vital.toUpperCase()} and its paint span`, async ({ getLocalTestUrl, page, browserName }) => {
    sentryTest.skip(shouldSkipTracingTest() || (chromiumOnly && browserName !== 'chromium'));
    const spans = collectStreamedSpans(page);
    const pageloadPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');
    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);
    const pageload = await pageloadPromise;
    await page.evaluate(() => (window as any).Sentry.flush());

    expect(pageload.attributes[`browser.web_vital.${vital}.value`]?.value).toBeGreaterThan(0);
    const paintSpans = spans.filter(span => span.name === name);
    expect(paintSpans).toHaveLength(1);
    expect(getSpanOp(paintSpans[0])).toBe('browser.paint');
    expect(paintSpans[0].parent_span_id).toBe(pageload.span_id);
    expect(paintSpans[0].trace_id).toBe(pageload.trace_id);
  });
});
