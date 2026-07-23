import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { hidePage, shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest(
  'captures an INP click as a streamed span for a parametrized transaction',
  async ({ browserName, getLocalTestUrl, page }) => {
    const supportedBrowsers = ['chromium'];

    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const inpSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'ui.interaction.click');

    await page.goto(url);

    await page.locator('[data-test-id=normal-button]').click();
    await page.locator('.clicked[data-test-id=normal-button]').isVisible();

    await page.waitForTimeout(500);

    // Page hide to trigger INP
    await hidePage(page);

    const inpSpan = await inpSpanPromise;

    expect(inpSpan.attributes['sentry.op']).toEqual({ type: 'string', value: 'ui.interaction.click' });
    expect(inpSpan.name).toBe('body > NormalButton');
    // The parametrized route name flows onto the INP span.
    expect(inpSpan.attributes['sentry.segment.name']).toEqual({ type: 'string', value: 'test-route' });

    const inpValue = inpSpan.attributes['browser.web_vital.inp.value']?.value as number;
    expect(inpValue).toBeGreaterThan(0);
  },
);
