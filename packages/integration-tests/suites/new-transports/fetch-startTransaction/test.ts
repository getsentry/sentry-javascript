import { expect } from '@playwright/test';
import { Event } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest('should report a transaction with the new fetch transport', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });
  const transaction = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(transaction.transaction).toBe('test_transaction_1');
  expect(transaction.spans).toBeDefined();
});
