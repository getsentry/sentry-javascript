import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends an error event to Sentry', async ({ request }) => {
  const errorEventPromise = waitForError('nitro-3', event => {
    return !event.type && !!event.exception?.values?.some(v => v.value === 'This is a test error');
  });

  await request.get('/api/test-error');

  const errorEvent = await errorEventPromise;

  // Nitro wraps thrown errors in an HTTPError with .cause, producing a chained exception
  expect(errorEvent.exception?.values).toHaveLength(2);

  // The innermost exception (values[0]) is the original thrown error
  expect(errorEvent.exception?.values?.[0]?.type).toBe('Error');
  expect(errorEvent.exception?.values?.[0]?.value).toBe('This is a test error');
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual(
    expect.objectContaining({
      handled: false,
      type: 'auto.function.nitro',
    }),
  );

  // The outermost exception (values[1]) is the HTTPError wrapper
  expect(errorEvent.exception?.values?.[1]?.type).toBe('HTTPError');
  expect(errorEvent.exception?.values?.[1]?.value).toBe('This is a test error');
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
