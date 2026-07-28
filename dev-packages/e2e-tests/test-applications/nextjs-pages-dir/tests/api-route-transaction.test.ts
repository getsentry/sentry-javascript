import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// A pages-router API route sees both Next.js's own `BaseServer.handleRequest` OTEL transaction and the
// transaction created by `wrapApiHandlerWithSentry`. Exactly one of them must be sent for a request, never
// both. This guards against regressing back to duplicate root transactions for the same API route.
test('Sends exactly one transaction for a pages-router API route', async ({ request }) => {
  const apiRouteTransactions: string[] = [];

  // Never resolves; we accumulate every matching transaction and assert on the total after a grace period.
  const collectorPromise = waitForTransaction('nextjs-pages-dir', transactionEvent => {
    if (transactionEvent?.transaction === 'GET /api/endpoint') {
      apiRouteTransactions.push(transactionEvent.contexts?.trace?.trace_id ?? '<no-trace-id>');
    }
    return false;
  });

  const response = await request.get('/api/endpoint');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  await Promise.race([collectorPromise, new Promise(resolve => setTimeout(resolve, 6000))]);

  expect(apiRouteTransactions).toHaveLength(1);
});
