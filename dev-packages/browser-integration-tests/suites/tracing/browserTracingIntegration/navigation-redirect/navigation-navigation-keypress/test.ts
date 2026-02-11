import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../../utils/helpers';

sentryTest(
  'creates a navigation root span if a keypress happened within the last 1.5s',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadRequestPromise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === 'pageload');
    const navigationRequestPromise = waitForTransactionRequest(
      page,
      event => event.contexts?.trace?.op === 'navigation' && event.transaction === '/sub-page',
    );

    const navigationRequest2Promise = waitForTransactionRequest(
      page,
      event => event.contexts?.trace?.op === 'navigation' && event.transaction === '/sub-page-2',
    );

    await page.goto(url);

    await pageloadRequestPromise;

    await page.focus('#btn1');
    await page.keyboard.press('Enter');

    await page.waitForTimeout(500);

    await page.focus('#btn2');
    await page.keyboard.press('Enter');

    const navigationRequest = envelopeRequestParser(await navigationRequestPromise);
    const navigationRequest2 = envelopeRequestParser(await navigationRequest2Promise);

    expect(navigationRequest.contexts?.trace?.op).toBe('navigation');
    expect(navigationRequest.transaction).toEqual('/sub-page');

    const redirectSpans = navigationRequest.spans?.filter(span => span.op === 'navigation.redirect') || [];
    expect(redirectSpans).toHaveLength(1);

    expect(redirectSpans[0].description).toEqual('/sub-page-redirect');

    expect(navigationRequest2.contexts?.trace?.op).toBe('navigation');
    expect(navigationRequest2.transaction).toEqual('/sub-page-2');

    const redirectSpans2 = navigationRequest2.spans?.filter(span => span.op === 'navigation.redirect') || [];
    expect(redirectSpans2).toHaveLength(0);
  },
);
