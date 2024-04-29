import { expect, test } from '@playwright/test';
import { AxiosError, axios } from './axios';
import { readEventsDir } from './utils';
import path from "node:path";

const EVENT_POLLING_TIMEOUT = 90_000;

interface Tag {
  key: string,
  value: unknown,
}

test('Sends two linked transactions (server & client) to Sentry', async ({ page }, testInfo) => {
  // We will be utilizing `testId` provided by the test runner to correlate
  // this test instance with the events we are going to send to Sentry.
  // See `Sentry.setTag` in `app/routes/_index.tsx`.
  await page.goto(`/?tag=${testInfo.testId}`);

  const recordedTransactionsHandle = await page.waitForFunction(() => {
    const hasTransactions = Array.isArray(window.recordedTransactions) && window.recordedTransactions.length >= 1;
    if (hasTransactions) return window.recordedTransactions
  });
  const clientEventIds = await recordedTransactionsHandle.jsonValue();
  if (!clientEventIds) throw new Error("Application didn't record any transaction event IDs.");
  console.log(`Polling for transaction eventIds: ${JSON.stringify(clientEventIds)}`);

  let pageLoadTransactionEvent = null;

  await Promise.all(
    clientEventIds.map(async eventId => {
      await expect
        .poll(
          async () => {
            try {
              const { data: transactionEvent, status } = await axios.get(`/events/${eventId}/`);
              // Ref: https://docs.sentry.io/api/events/list-a-projects-error-events/
              const isFromThisTest = (transactionEvent.tags as Tag[]).find(({ key, value }) => {
                return key === "sentry_test" && value === testInfo.testId;
              });
              if (isFromThisTest) {
                const op = transactionEvent.contexts?.trace?.op;
                if (op === 'pageload') pageLoadTransactionEvent = transactionEvent;
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

  let serverEventIds = null;
  await expect.poll(async () => {
    const files = await readEventsDir();
    if (files.length !== 0) {
      serverEventIds = files.map(f => path.basename(f, ".txt"));
      return true;
    }
    return false;
  }).toBe(true)
  expect(serverEventIds).not.toBeNull();

  console.log(`Polling for server-side eventIds: ${JSON.stringify(serverEventIds)}`);
  // we could have read the event details from the file (since we are
  // dumping event without any mutations before sending it to Sentry),
  // but let's following the practice in other test applications and
  // also do some calls to Sentry to get back out server event
  let httpServerTransactionEvent = null;

  await Promise.all(
    (serverEventIds as unknown as string[]).map(async eventId => {
      await expect
        .poll(
          async () => {
            try {
              const { data: transactionEvent, status } = await axios.get(`/events/${eventId}/`);
              // Ref: https://docs.sentry.io/api/events/list-a-projects-error-events/
              const isFromThisTest = (transactionEvent.tags as Tag[]).find(({ key, value }) => {
                return key === "sentry_test" && value === testInfo.testId;
              });
              if (isFromThisTest) {
                const op = transactionEvent.contexts?.trace?.op;
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
  // we successfully fetched "back" out event
  expect(httpServerTransactionEvent).not.toBeNull();

  // the two events are both related to `routes/_index` page ...
  const httpServerTransactionTag = (httpServerTransactionEvent!.tags as Tag[]).find(({ key }) => key === "transaction");
  const pageLoadTransactionTag = (pageLoadTransactionEvent!.tags as Tag[]).find(({ key }) => key === "transaction");
  expect(httpServerTransactionTag!.value).toBe('routes/_index');
  expect(pageLoadTransactionTag!.value).toBe('routes/_index');

  // ... and they share the same trace id (i.e., they are the two transactions of the same trace)
  const httpServerTraceId = httpServerTransactionEvent!.contexts?.trace?.trace_id;
  expect(httpServerTraceId).toBeDefined();
  const pageLoadTraceId = pageLoadTransactionEvent!.contexts?.trace?.trace_id;
  expect(pageLoadTraceId).toEqual(httpServerTraceId);

  // page load span has got http server span as its _parent_
  const httpServerSpanId = httpServerTransactionEvent!.contexts?.trace?.span_id;
  expect(httpServerSpanId).toBeDefined();
  const pageLoadParentSpanId = pageLoadTransactionEvent!.contexts?.trace?.parent_span_id;
  expect(pageLoadParentSpanId).toEqual(httpServerSpanId);
});
