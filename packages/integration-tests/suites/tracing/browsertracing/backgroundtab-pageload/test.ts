import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should finish pageload transaction when the page goes background', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);

  const pageloadTransactionPromise = getFirstSentryEnvelopeRequest<Event>(page);

  await page.click('#go-background');

  const pageloadTransaction = await pageloadTransactionPromise;

  expect(pageloadTransaction.contexts?.trace?.op).toBe('pageload');
  expect(pageloadTransaction.contexts?.trace?.status).toBe('cancelled');
  expect(pageloadTransaction.contexts?.trace?.tags).toMatchObject({
    visibilitychange: 'document.hidden',
  });
});
