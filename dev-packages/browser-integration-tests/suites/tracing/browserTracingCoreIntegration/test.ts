import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../utils/spanUtils';

sentryTest(
  'composes browserTracingCoreIntegration() with only the standalone integrations passed to it',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    await page.route('http://sentry-test-site.example/*', route => route.fulfill({ body: 'ok' }));

    const url = await getLocalTestUrl({ testDir: __dirname });

    const spans = collectStreamedSpans(page);
    const pageloadPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');

    await page.goto(url);

    const pageloadSpan = await pageloadPromise;
    await page.evaluate(() => (window as any).Sentry.flush());

    const requestSpans = spans.filter(span => getSpanOp(span) === 'http.client');
    expect(requestSpans).toHaveLength(1);
    expect(requestSpans[0]).toMatchObject({
      parent_span_id: pageloadSpan.span_id,
      trace_id: pageloadSpan.trace_id,
    });

    // `resourcesIntegration` was not added, so the page's own script loads must not produce spans.
    expect(spans.filter(span => getSpanOp(span)?.startsWith('resource.'))).toHaveLength(0);
  },
);
