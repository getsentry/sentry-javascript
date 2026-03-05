import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Captures manually reported error in microservice handler', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nestjs-microservices', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Manually captured microservice error';
  });

  await fetch(`${baseURL}/test-microservice-manual-capture`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Manually captured microservice error');
});

// There is no good mechanism to verify that an event was NOT sent to Sentry.
// The idea here is that we first send a message that triggers an exception which won't be auto-captured,
// and then send a message that triggers a manually captured error which will be sent to Sentry.
// If the manually captured error arrives, we can deduce that the first exception was not sent,
// because both requests go through the same NestJS app and Sentry client, so events are processed in order.
test('Does not automatically capture exceptions thrown in microservice handler', async ({ baseURL }) => {
  let autoCaptureFired = false;

  waitForError('nestjs-microservices', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'Microservice exception with id 123') {
      autoCaptureFired = true;
    }
    return false;
  });

  const manualCapturePromise = waitForError('nestjs-microservices', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Manually captured microservice error';
  });

  await fetch(`${baseURL}/test-microservice-exception/123`);
  await fetch(`${baseURL}/test-microservice-manual-capture`);

  await manualCapturePromise;

  await fetch(`${baseURL}/flush`);

  expect(autoCaptureFired).toBe(false);
});
