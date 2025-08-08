import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  shouldSkipTracingTest,
  waitForTransactionRequestOnUrl,
} from '../../../../utils/helpers';

sentryTest(
  'sets user.ip_address to "auto" on transactions when sendDefaultPii: true',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });
    const req = await waitForTransactionRequestOnUrl(page, url);
    const transaction = envelopeRequestParser(req);
    expect(transaction.sdk?.settings?.infer_ip).toBe('auto');
  },
);
