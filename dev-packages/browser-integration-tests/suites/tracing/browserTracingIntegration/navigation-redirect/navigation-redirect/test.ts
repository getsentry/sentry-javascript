import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../../utils/spanUtils';

sentryTest(
  'creates a navigation root span and redirect child span if no click happened within the last 1.5s',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const allSpans = collectStreamedSpans(page);
    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
    const navigationSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'navigation');

    await page.goto(url);

    await pageloadSpanPromise;

    // Now trigger navigation (since no span is active), and then a redirect in the navigation, with
    await page.click('#btn1');

    const navigationSpan = await navigationSpanPromise;
    await page.evaluate(() => (window as any).Sentry.flush());

    expect(getSpanOp(navigationSpan)).toBe('navigation');
    expect(navigationSpan.name).toEqual('Navigation');
    expect(navigationSpan.attributes['url.path']?.value).toEqual('/sub-page');

    const spans = allSpans.filter(span => span.attributes['sentry.segment.id']?.value === navigationSpan.span_id);

    expect(spans).toContainEqual(
      expect.objectContaining({
        name: 'Navigation',
        attributes: expect.objectContaining({
          'sentry.op': { type: 'string', value: 'navigation.redirect' },
          'url.path': { type: 'string', value: '/sub-page-redirect' },
        }),
      }),
    );
  },
);
