import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Captures manually reported error in microservice handler', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nestjs-microservices', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Manually captured microservice error';
  });

  await fetch(`${baseURL}/test-microservice-manual-capture`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Manually captured microservice error');
});

// To verify that an exception is NOT automatically captured, we trigger it,
// wait for the transaction from that request to confirm it completed, flush,
// and then assert no error event was received.
test('Does not automatically capture exceptions thrown in microservice handler', async ({ baseURL }) => {
  let autoCaptureFired = false;

  waitForError('nestjs-microservices', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'Microservice exception with id 123') {
      autoCaptureFired = true;
    }
    return false;
  });

  const transactionPromise = waitForTransaction('nestjs-microservices', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-microservice-exception/:id';
  });

  await fetch(`${baseURL}/test-microservice-exception/123`);

  await transactionPromise;

  await fetch(`${baseURL}/flush`);

  expect(autoCaptureFired).toBe(false);
});
