import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  shouldSkipTracingTest,
  waitForTransactionRequestOnUrl,
} from '../../../../utils/helpers';

sentryTest(
  'should default user to {{auto}} on transactions when sendDefaultPii: true',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });
    const req = await waitForTransactionRequestOnUrl(page, url);
    const transaction = envelopeRequestParser(req);
    expect(transaction.user?.ip_address).toBe('{{auto}}');
  },
);
