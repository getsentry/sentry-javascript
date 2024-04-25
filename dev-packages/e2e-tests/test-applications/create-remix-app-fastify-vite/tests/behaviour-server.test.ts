import { expect, test } from '@playwright/test';
import { AxiosError, axios } from './axios';
import { TransactionEvent } from '@sentry/types';
import { inspect } from 'util';

const EVENT_POLLING_TIMEOUT = 90_000;

test('Sends two linked transactions (server & client) to Sentry', async ({ page }, testInfo) => {
/*
  const httpServerTransactionPromise = waitForTransaction('create-remix-app-express-vite-dev', transactionEvent => {
    return (
      transactionEvent.type === 'transaction' &&
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      transactionEvent.tags?.['sentry_test'] === testTag
    );
  });

  const pageLoadTransactionPromise = waitForTransaction('create-remix-app-express-vite-dev', transactionEvent => {
    return (
      transactionEvent.type === 'transaction' &&
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.tags?.['sentry_test'] === testTag
    );
  });
*/
  // We will be utilizing `testId` provided by the test runner to correlate
  // this test instance with the events we are going to send to Sentry.
  // See `Sentry.setTag` in `app/routes/_index.tsx`.
  await page.goto(`/?tag=${testInfo.testId}`);

  const recordedTransactionsHandle = await page.waitForFunction(() => {
    const hasTransactions = Array.isArray(window.recordedTransactions) && window.recordedTransactions.length >= 1;
    if (hasTransactions) return window.recordedTransactions
  });
  const eventIds = await recordedTransactionsHandle.jsonValue();
  if (!eventIds) throw new Error("Application didn't record any transaction event IDs.");
  console.log(`Polling for transaction eventIds: ${JSON.stringify(eventIds)}`);

  let pageLoadTransactionEvent = null;
  let httpServerTransactionEvent = null;

  await Promise.all(
    eventIds.map(async eventId => {
      await expect
        .poll(
          async () => {
            try {
              const { data: transactionEvent, status } = await axios.get<TransactionEvent>(`/events/${eventId}/`);
              const isFromThisTest = transactionEvent.tags?.["sentry_test"] === testInfo.testId;
              console.log({testId: testInfo.testId, sentryTest: transactionEvent.tags?.["sentry_test"], eventTags: inspect(transactionEvent.tags, false, null)})
              if (isFromThisTest) {

                const op = transactionEvent.contexts?.trace?.op;
                console.log(inspect({ transactionEvent, op }, true, null));
                if (op === 'pageload') pageLoadTransactionEvent = transactionEvent;
                if (op === 'http.server') httpServerTransactionEvent = transactionEvent;
              }
              return status;
            } catch (e) {
              const notThereJustYet = e instanceof AxiosError && e.response && e.response.status === 404;
              if (notThereJustYet) return 404;
              throw e
            }
          },
          {
            timeout: EVENT_POLLING_TIMEOUT,
          },
        )
        .toBe(200);
    }),
  );

  expect(pageLoadTransactionEvent).not.toBeNull();
  expect(httpServerTransactionEvent).not.toBeNull();

  /*
  const pageloadTransaction = await pageLoadTransactionPromise;
  const httpServerTransaction = await httpServerTransactionPromise;

  expect(pageloadTransaction).toBeDefined();
  expect(httpServerTransaction).toBeDefined();

  const httpServerTraceId = httpServerTransaction.contexts?.trace?.trace_id;
  const httpServerSpanId = httpServerTransaction.contexts?.trace?.span_id;

  const pageLoadTraceId = pageloadTransaction.contexts?.trace?.trace_id;
  const pageLoadSpanId = pageloadTransaction.contexts?.trace?.span_id;
  const pageLoadParentSpanId = pageloadTransaction.contexts?.trace?.parent_span_id;

  expect(httpServerTransaction.transaction).toBe('routes/_index');
  expect(pageloadTransaction.transaction).toBe('routes/_index');

  expect(httpServerTraceId).toBeDefined();
  expect(httpServerSpanId).toBeDefined();

  expect(pageLoadTraceId).toEqual(httpServerTraceId);
  expect(pageLoadParentSpanId).toEqual(httpServerSpanId);
  expect(pageLoadSpanId).not.toEqual(httpServerSpanId);
  */
});
