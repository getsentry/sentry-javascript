import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../../utils/helpers';

sentryTest(
  'should create a navigation.redirect span if a keypress happened more than 300ms before navigation',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadRequestPromise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === 'pageload');
    const navigationRequestPromise = waitForTransactionRequest(
      page,
      event => event.contexts?.trace?.op === 'navigation',
    );

    await page.goto(url);

    await pageloadRequestPromise;

    // Now trigger navigation, and then a redirect in the navigation
    await page.focus('#btn1');
    await page.keyboard.press('Enter');

    const navigationRequest = envelopeRequestParser(await navigationRequestPromise);

    expect(navigationRequest.contexts?.trace?.op).toBe('navigation');
    expect(navigationRequest.transaction).toEqual('/sub-page');

    const spans = navigationRequest.spans || [];

    expect(spans).toContainEqual(
      expect.objectContaining({
        op: 'navigation.redirect',
        description: '/sub-page-redirect',
      }),
    );
  },
);
