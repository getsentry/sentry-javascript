import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequestOnUrl } from '../../../utils/helpers';

sentryTest('limits static transactions to 1000 child spans', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const url = await getLocalTestUrl({ testDir: __dirname });
  const req = await waitForTransactionRequestOnUrl(page, url);
  const transaction = envelopeRequestParser(req);

  expect(transaction.spans).toHaveLength(1000);
  expect(transaction.spans).toContainEqual(expect.objectContaining({ description: 'child 0' }));
  expect(transaction.spans).toContainEqual(expect.objectContaining({ description: 'child 999' }));
  expect(transaction.spans).not.toContainEqual(expect.objectContaining({ description: 'child 1000' }));
});
