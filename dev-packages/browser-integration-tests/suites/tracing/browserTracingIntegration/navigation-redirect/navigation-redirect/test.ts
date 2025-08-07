import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../../utils/helpers';

sentryTest(
  'creates a navigation root span and redirect child span if no click happened within the last 1.5s',
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

    // Now trigger navigation (since no span is active), and then a redirect in the navigation, with
    await page.click('#btn1');

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
