import { URL_PATH, SENTRY_SEGMENT_ID } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../../utils/spanUtils';

sentryTest(
  'creates navigation root span if click happened within 1.5s of the last navigation',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const allSpans = collectStreamedSpans(page);
    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
    const navigationSpanPromise = waitForStreamedSpan(
      page,
      span => getSpanOp(span) === 'navigation' && span.attributes[URL_PATH]?.value === '/sub-page',
    );
    const navigation2SpanPromise = waitForStreamedSpan(
      page,
      span => getSpanOp(span) === 'navigation' && span.attributes[URL_PATH]?.value === '/sub-page-2',
    );

    await page.goto(url);

    await pageloadSpanPromise;

    // Now trigger navigation (since no span is active), and then a redirect in the navigation, with
    await page.click('#btn1');

    const navigationSpan = await navigationSpanPromise;
    const navigation2Span = await navigation2SpanPromise;
    await page.evaluate(() => (window as any).Sentry.flush());

    expect(getSpanOp(navigationSpan)).toBe('navigation');
    expect(navigationSpan.name).toEqual('Navigation');
    expect(navigationSpan.attributes[URL_PATH]?.value).toEqual('/sub-page');

    const spans = allSpans
      .filter(span => span.attributes[SENTRY_SEGMENT_ID]?.value === navigationSpan.span_id)
      .filter(s => getSpanOp(s) === 'navigation.redirect');

    expect(spans).toHaveLength(0);

    expect(getSpanOp(navigation2Span)).toBe('navigation');
    expect(navigation2Span.name).toEqual('Navigation');
    expect(navigation2Span.attributes[URL_PATH]?.value).toEqual('/sub-page-2');

    const spans2 = allSpans
      .filter(span => span.attributes[SENTRY_SEGMENT_ID]?.value === navigation2Span.span_id)
      .filter(s => getSpanOp(s) === 'navigation.redirect');
    expect(spans2).toHaveLength(0);
  },
);
