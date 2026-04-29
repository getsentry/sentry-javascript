import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Propagates server trace to client pageload via Server-Timing headers', async ({ page }) => {
  const clientTxnPromise = waitForTransaction('nitro-3', event => {
    return event?.contexts?.trace?.op === 'pageload';
  });

  await page.goto('/');

  const clientTxn = await clientTxnPromise;

  expect(clientTxn.contexts?.trace?.trace_id).toBeDefined();
  expect(clientTxn.contexts?.trace?.trace_id).toMatch(/[a-f0-9]{32}/);
  expect(clientTxn.contexts?.trace?.op).toBe('pageload');
});
