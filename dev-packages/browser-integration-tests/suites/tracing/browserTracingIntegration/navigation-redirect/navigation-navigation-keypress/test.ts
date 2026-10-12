import { URL_PATH, SENTRY_SEGMENT_ID } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../../utils/spanUtils';

sentryTest(
  'creates a navigation root span if a keypress happened within the last 1.5s',
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

    const navigationSpan2Promise = waitForStreamedSpan(
      page,
      span => getSpanOp(span) === 'navigation' && span.attributes[URL_PATH]?.value === '/sub-page-2',
    );

    await page.goto(url);

    await pageloadSpanPromise;

    await page.focus('#btn1');
    await page.keyboard.press('Enter');

    await page.waitForTimeout(500);

    await page.focus('#btn2');
    await page.keyboard.press('Enter');

    const navigationSpan = await navigationSpanPromise;
    const navigationSpan2 = await navigationSpan2Promise;
    await page.evaluate(() => (window as any).Sentry.flush());

    expect(getSpanOp(navigationSpan)).toBe('navigation');
    expect(navigationSpan.name).toEqual('Navigation');
    expect(navigationSpan.attributes[URL_PATH]?.value).toEqual('/sub-page');

    const redirectSpans = allSpans
      .filter(span => span.attributes[SENTRY_SEGMENT_ID]?.value === navigationSpan.span_id)
      .filter(span => getSpanOp(span) === 'navigation.redirect');
    expect(redirectSpans).toHaveLength(1);

    expect(redirectSpans[0].name).toBe('Navigation');
    expect(redirectSpans[0].attributes[URL_PATH]?.value).toBe('/sub-page-redirect');

    expect(getSpanOp(navigationSpan2)).toBe('navigation');
    expect(navigationSpan2.name).toEqual('Navigation');
    expect(navigationSpan2.attributes[URL_PATH]?.value).toEqual('/sub-page-2');

    const redirectSpans2 = allSpans
      .filter(span => span.attributes[SENTRY_SEGMENT_ID]?.value === navigationSpan2.span_id)
      .filter(span => getSpanOp(span) === 'navigation.redirect');
    expect(redirectSpans2).toHaveLength(0);
  },
);
