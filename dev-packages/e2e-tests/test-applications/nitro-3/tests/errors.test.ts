import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends an error event to Sentry', async ({ request }) => {
  const errorEventPromise = waitForError('nitro-3', event => {
    return !!event.exception?.values?.some(
      v => v.value === 'This is a test error' && v.mechanism?.type === 'auto.function.nitro.captureErrorHook',
    );
  });

  await request.get('/api/test-error').catch(() => {
    // noop - route throws, request may be reset before a response is sent
  });

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toEqual([
    expect.objectContaining({
      type: 'Error',
      value: 'This is a test error',
      mechanism: expect.objectContaining({
        handled: false,
        type: 'auto.function.nitro.captureErrorHook',
      }),
    }),
    expect.objectContaining({
      type: 'HTTPError',
      value: 'This is a test error',
    }),
  ]);
});

test('Does not send an explicitly thrown 400 error to Sentry', async ({ request }) => {
  let errorReceived = false;

  void waitForError('nitro-3', event => {
    if (event.exception?.values?.some(v => v.value === 'Explicit 400 test error')) {
      errorReceived = true;
      return true;
    }
    return false;
  });

  const flushTransactionPromise = waitForTransaction('nitro-3', event => {
    return event.transaction === 'GET /api/flush';
  });

  const response = await request.get('/api/test-error-400');
  expect(response.status()).toBe(400);

  const flushResponse = await request.get('/api/flush');
  expect(flushResponse.status()).toBe(200);
  await flushTransactionPromise;

  expect(errorReceived).toBe(false);
});

test('Does not send 404 errors to Sentry', async ({ request }) => {
  let errorReceived = false;

  void waitForError('nitro-3', event => {
    if (!event.type) {
      errorReceived = true;
      return true;
    }
    return false;
  });

  await request.get('/api/non-existent-route');

  expect(errorReceived).toBe(false);
});
