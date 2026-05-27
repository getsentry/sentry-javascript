import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends an error event to Sentry', async ({ request }) => {
  const errorEventPromise = waitForError('nitro-3', event => {
    return !event.type && !!event.exception?.values?.some(v => v.value === 'This is a test error');
  });

  await request.get('/api/test-error');

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);

  expect(errorEvent.exception?.values?.[0]?.type).toBe('Error');
  expect(errorEvent.exception?.values?.[0]?.value).toBe('This is a test error');
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual(
    expect.objectContaining({
      handled: false,
      type: 'auto.http.nitro.onTraceError',
    }),
  );
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
