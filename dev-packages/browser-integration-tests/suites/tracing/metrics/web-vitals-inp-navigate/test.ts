import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { hidePage, shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

const supportedBrowsers = ['chromium'];

sentryTest(
  'captures INP with correct target name when navigation keeps DOM element',
  async ({ browserName, getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const inpSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'ui.interaction.click');

    await page.goto(url);

    // Simulating route change (keeping <nav> in DOM)
    await page.locator('[data-test-id=nav-link-keepDOM]').click();
    await page.locator('.navigated').isVisible();

    await page.waitForTimeout(500);

    // Page hide to trigger INP
    await hidePage(page);

    const inpSpan = await inpSpanPromise;

    expect(inpSpan.attributes['sentry.op']).toEqual({ type: 'string', value: 'ui.interaction.click' });
    expect(inpSpan.name).toBe('body > nav#navigation > NavigationLink');

    const inpValue = inpSpan.attributes['browser.web_vital.inp.value']?.value as number;
    expect(inpValue).toBeGreaterThan(0);
  },
);

sentryTest(
  'captures INP with unknown target name when navigation removes element from DOM',
  async ({ browserName, getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const inpSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'ui.interaction.click');

    await page.goto(url);

    // Simulating route change (also changing <nav> in DOM)
    await page.locator('[data-test-id=nav-link-changeDOM]').click();
    await page.locator('.navigated').isVisible();

    await page.waitForTimeout(500);

    // Page hide to trigger INP
    await hidePage(page);

    const inpSpan = await inpSpanPromise;

    expect(inpSpan.attributes['sentry.op']).toEqual({ type: 'string', value: 'ui.interaction.click' });
    expect(inpSpan.name).toBe('body > nav#navigation > NavigationLink');

    const inpValue = inpSpan.attributes['browser.web_vital.inp.value']?.value as number;
    expect(inpValue).toBeGreaterThan(0);
  },
);
