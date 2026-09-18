import { expect, test } from '@playwright/test';
import { EVENT_POLLING_OPTIONS, findErrorInTrace, findSpanInTrace } from './utils/sentry-api';

test('Sends exception to Sentry', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-error`);
  const { exceptionId, traceId } = await response.json();

  console.log(`Polling for error eventId: ${exceptionId} in trace: ${traceId}`);

  await expect.poll(() => findErrorInTrace(traceId, exceptionId), EVENT_POLLING_OPTIONS).toBeDefined();
});

test('Sends streamed span to Sentry', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-span`);
  const { traceId } = await response.json();

  console.log(`Polling for streamed span in trace: ${traceId}`);

  await expect
    .poll(() => findSpanInTrace(traceId, 'e2e-test'), EVENT_POLLING_OPTIONS)
    .toMatchObject({ op: 'e2e-test' });
});
