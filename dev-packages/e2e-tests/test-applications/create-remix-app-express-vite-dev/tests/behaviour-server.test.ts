import { expect, test } from '@playwright/test';
import { uuid4 } from '@sentry/utils';

import { waitForTransaction } from '../event-proxy-server';

test('Sends two linked transactions (server & client) to Sentry', async ({ page }) => {
  // We use this to identify the transactions
  const testTag = uuid4();

  // no server span here!

  const pageLoadTransactionPromise = waitForTransaction('create-remix-app-express-vite-dev', transactionEvent => {
    return (
      transactionEvent.type === 'transaction' &&
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.tags?.['sentry_test'] === testTag
    );
  });

  page.goto(`/?tag=${testTag}`);

  const pageloadTransaction = await pageLoadTransactionPromise;

  expect(pageloadTransaction).toBeDefined();

  const pageLoadTraceId = pageloadTransaction.contexts?.trace?.trace_id;
  const pageLoadSpanId = pageloadTransaction.contexts?.trace?.span_id;
  const pageLoadParentSpanId = pageloadTransaction.contexts?.trace?.parent_span_id;

  expect(pageloadTransaction.transaction).toBe('routes/_index');

  expect(pageLoadTraceId).toBeDefined();
  expect(pageLoadParentSpanId).toBeUndefined();
  expect(pageLoadSpanId).toBeDefined();
});
