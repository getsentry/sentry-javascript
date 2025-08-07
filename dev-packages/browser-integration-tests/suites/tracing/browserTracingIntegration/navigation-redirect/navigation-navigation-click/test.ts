import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../../utils/helpers';

sentryTest(
  'creates navigation root span if click happened within 1.5s of the last navigation',
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
    const navigation2RequestPromise = waitForTransactionRequest(
      page,
      event => event.contexts?.trace?.op === 'navigation' && event.transaction === '/sub-page-2',
    );

    await page.goto(url);

    await pageloadRequestPromise;

    // Now trigger navigation (since no span is active), and then a redirect in the navigation, with
    await page.click('#btn1');

    const navigationRequest = envelopeRequestParser(await navigationRequestPromise);
    const navigation2Request = envelopeRequestParser(await navigation2RequestPromise);

    expect(navigationRequest.contexts?.trace?.op).toBe('navigation');
    expect(navigationRequest.transaction).toEqual('/sub-page');

    const spans = (navigationRequest.spans || []).filter(s => s.op === 'navigation.redirect');

    expect(spans).toHaveLength(0);

    expect(navigation2Request.contexts?.trace?.op).toBe('navigation');
    expect(navigation2Request.transaction).toEqual('/sub-page-2');

    const spans2 = (navigation2Request.spans || []).filter(s => s.op === 'navigation.redirect');
    expect(spans2).toHaveLength(0);
  },
);
