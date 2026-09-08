import { expect, test } from '@playwright/test';
import { EVENT_POLLING_OPTIONS, findErrorInTrace, findTransactionInTrace } from './utils/sentry-api';

test('Sends exception to Sentry', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-error`);
  const { exceptionId, traceId } = await response.json();

  console.log(`Polling for error eventId: ${exceptionId} in trace: ${traceId}`);

  await expect.poll(() => findErrorInTrace(traceId, exceptionId), EVENT_POLLING_OPTIONS).toBeDefined();
});

test('Sends transaction to Sentry', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-transaction`);
  const { transactionId, traceId } = await response.json();

  console.log(`Polling for transaction eventId: ${transactionId} in trace: ${traceId}`);

  await expect
    .poll(() => findTransactionInTrace(traceId, transactionId), EVENT_POLLING_OPTIONS)
    .toMatchObject({ op: 'e2e-test' });
});
