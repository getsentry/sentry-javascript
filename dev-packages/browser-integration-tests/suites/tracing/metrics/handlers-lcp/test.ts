import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

const bundle = process.env.PW_BUNDLE || '';

sentryTest(
  'should capture metrics for LCP instrumentation handlers',
  async ({ browserName, getLocalTestUrl, page }) => {
    // This uses a utility that is not exported in CDN bundles
    if (shouldSkipTracingTest() || browserName !== 'chromium' || bundle.startsWith('bundle')) {
      sentryTest.skip();
    }

    await page.route('**/path/to/image.png', (route: Route) =>
      route.fulfill({ path: `${__dirname}/assets/sentry-logo-600x179.png` }),
    );

    const url = await getLocalTestUrl({ testDir: __dirname });

    const lcpPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'ui.webvital.lcp');
    await page.goto(url);
    await page.waitForFunction('window._LCP === 107400 && window._LCP2 === 107400');
    await page.locator('button').click();
    const lcpSpan = await lcpPromise;

    expect(lcpSpan.attributes['browser.web_vital.lcp.value']?.value).toBeGreaterThan(0);
    expect(lcpSpan.attributes['browser.web_vital.lcp.element']).toEqual({ type: 'string', value: 'body > img' });
    expect(lcpSpan.attributes['browser.web_vital.lcp.size']).toEqual({ type: 'integer', value: 107400 });
    expect(await page.evaluate('window._LCP')).toBe(107400);
    expect(await page.evaluate('window._LCP2')).toBe(107400);
    expect(await page.evaluate('window._LCP3')).toBeUndefined();

    await page.evaluate('window.ADD_HANDLER()');
    await page.waitForFunction('window._LCP3 === 107400');
    expect(await page.evaluate('window._LCP3')).toBe(107400);
  },
);
