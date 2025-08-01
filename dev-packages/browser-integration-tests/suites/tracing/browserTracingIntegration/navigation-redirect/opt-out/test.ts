import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../../utils/helpers';

sentryTest(
  "doesn't create a navigation.redirect span if `detectRedirects` is set to false",
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

    const pageloadRequest = envelopeRequestParser(await pageloadRequestPromise);
    // Ensure a navigation span is sent, too
    await navigationRequestPromise;

    const spans = pageloadRequest.spans || [];

    expect(spans).not.toContainEqual(
      expect.objectContaining({
        op: 'navigation.redirect',
      }),
    );
  },
);
