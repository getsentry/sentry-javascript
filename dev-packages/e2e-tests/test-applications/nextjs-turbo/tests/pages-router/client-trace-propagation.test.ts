import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { extractTraceparentData } from '@sentry/utils';

test('Should propagate traces from server to client in pages router', async ({ page }) => {
  const serverTransactionPromise = waitForTransaction('nextjs-turbo', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /[param]/client-trace-propagation';
  });

  await page.goto(`/123/client-trace-propagation`);

  const sentryTraceLocator = await page.locator('meta[name="sentry-trace"]');
  const sentryTraceValue = await sentryTraceLocator.getAttribute('content');
  expect(sentryTraceValue).toMatch(/^[a-f0-9]{32}-[a-f0-9]{16}-[0-1]$/);

  const baggageLocator = await page.locator('meta[name="baggage"]');
  const baggageValue = await baggageLocator.getAttribute('content');
  expect(baggageValue).toMatch(/sentry-public_key=/);

  const traceparentData = extractTraceparentData(sentryTraceValue!);

  const serverTransaction = await serverTransactionPromise;

  expect(serverTransaction.contexts?.trace?.trace_id).toBe(traceparentData?.traceId);
});
