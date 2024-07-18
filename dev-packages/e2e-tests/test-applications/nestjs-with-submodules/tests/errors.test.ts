import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Handles exception correctly and does not send to Sentry if exception is thrown in module', async ({
  baseURL,
}) => {
  let errorEventOccurred = false;

  waitForError('nestjs', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'Something went wrong in the example module!') {
      errorEventOccurred = true;
    }

    return event?.transaction === 'GET /example-module';
  });

  const transactionEventPromise = waitForTransaction('nestjs', transactionEvent => {
    return transactionEvent?.transaction === 'GET /example-module';
  });

  const response = await fetch(`${baseURL}/example-module`);
  expect(response.status).toBe(400);

  await transactionEventPromise;

  await new Promise(resolve => setTimeout(resolve, 10000));

  expect(errorEventOccurred).toBe(false);
});
