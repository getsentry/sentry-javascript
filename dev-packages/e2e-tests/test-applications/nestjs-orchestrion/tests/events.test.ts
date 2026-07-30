import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

const PROXY = 'nestjs-orchestrion';

// `@OnEvent` opens an `event.nestjs` transaction per handled event.
test('@OnEvent opens an event.nestjs transaction', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction(PROXY, transactionEvent => {
    return transactionEvent?.transaction === 'event test.event';
  });

  await fetch(`${baseURL}/test-event`);
  const transactionEvent = await transactionPromise;

  expect(transactionEvent.contexts?.trace?.op).toBe('event.nestjs');
  expect(transactionEvent.contexts?.trace?.origin).toBe('auto.event.nestjs');
});
