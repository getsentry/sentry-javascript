import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../utils/helpers';

sentryTest('does not capture mark and measure spans by default', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  const transactionRequestPromise = waitForTransactionRequest(
    page,
    event => event.type === 'transaction' && event.contexts?.trace?.op === 'pageload',
  );

  await page.goto(url);

  const transactionEvent = envelopeRequestParser(await transactionRequestPromise);
  const userTimingSpans = transactionEvent.spans?.filter(({ op }) => op === 'mark' || op === 'measure');
  expect(userTimingSpans).toHaveLength(0);
});
