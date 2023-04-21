import { test, expect } from '@playwright/test';
import { waitForTransaction } from '../../../test-utils/event-proxy-server';
import { proxyServerName } from '../start-event-proxy';

test('Sends a transaction for an edge route request', async ({ page, request }) => {
  const routeHandlerTransactionPromise = waitForTransaction(proxyServerName, transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /api/[param]/edge'
    );
  });

  const result = await request.get('/api/my-param/edge');
  expect(result).toBe(2);
  await routeHandlerTransactionPromise;
});
